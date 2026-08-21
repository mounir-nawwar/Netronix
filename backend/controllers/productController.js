import {v2 as cloudinary} from 'cloudinary';
import mongoose from 'mongoose';

import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import userModel from '../models/userModel.js';
import { asyncHandler, ConflictError, NotFoundError, AppError, ValidationError } from '../errors/AppError.js';
import { assertVariantKeyBelongsTo, parseJsonField } from '../validators/domain.js';
import { variantsShape, inventoryShape, inventoryV2Shape, tagsShape, showcaseShape, clearImagesShape } from '../validators/product.js';
import { paginated, resolvePaging } from '../lib/pagination.js';
import { canonicalVariantId, deriveInventoryV2, entriesOf, legacyInventoryFrom, legacyVariantKey, normaliseInventoryV2, resolveVariant, VariantResolutionError } from '../lib/variant.js';
import { toMinor, DEFAULT_CURRENCY } from '../lib/money.js';

/**
 * Send one in-memory buffer to Cloudinary.
 *
 * `upload_stream` rather than `uploader.upload(item.path, …)`, because there is
 * no path any more — `multer.memoryStorage()` means the bytes never touch the
 * disk (SEC-008).
 */
const uploadBuffer = (buffer) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'image' },
            (error, result) => (error ? reject(error) : resolve({
                url: result.secure_url,
                publicId: result.public_id ?? null,
            })),
        )
        stream.end(buffer)
    })

async function cleanupUploads(assets) {
    const publicIds = assets.map((asset) => asset?.publicId).filter(Boolean)
    await Promise.allSettled(publicIds.map((publicId) =>
        cloudinary.uploader.destroy(publicId, { resource_type: 'image' })))
}

async function uploadImages(images) {
    const uploaded = []
    try {
        for (const image of images) uploaded.push(await uploadBuffer(image.buffer))
        return uploaded
    } catch {
        await cleanupUploads(uploaded)
        throw new AppError('Image upload failed. Please try again.', {
            status: 502,
            code: 'UPLOAD_FAILED',
            details: 'image provider rejected an upload',
        })
    }
}

/**
 * The catalog filter every public listing uses.
 *
 * Archived products are excluded by default (DB-007, ADM-003). Order history is
 * unaffected: a Phase 2 order line carries its own snapshot and never consults
 * the catalog, which is exactly what makes soft delete safe.
 */
const catalogFilter = ({ includeArchived = false } = {}) =>
    (includeArchived ? {} : { archived: { $ne: true } })

const inventoryRevisionFilter = (id, revision) => ({
    _id: id,
    ...(revision === 0
        ? { $or: [{ inventoryRevision: 0 }, { inventoryRevision: { $exists: false } }] }
        : { inventoryRevision: revision }),
})

// Function for adding Products
const addProduct = asyncHandler(async (req, res) => {
    const { name, description, price, brand, bestSeller } = req.validated.body;

    const parsedVariants = parseJsonField(req.validated.body.variants, variantsShape, 'variants');
    const parsedInventory = parseJsonField(req.validated.body.inventory, inventoryShape, 'inventory');
    const parsedTags = parseJsonField(req.validated.body.tags, tagsShape, 'tags');
    // DB-003. The admin console now sends the lossless form as well; when it is
    // present it is authoritative, and the legacy bag is derived from it rather
    // than the other way round.
    const parsedInventoryV2 = parseJsonField(req.validated.body.inventoryV2, inventoryV2Shape, 'inventoryV2');
    // Which homepage surfaces this product belongs to (FE-004). Absent means
    // "none", which is the honest default: a new product is not featured until
    // somebody says it is.
    const parsedShowcase = parseJsonField(req.validated.body.showcase, showcaseShape, 'showcase');

    // Complete domain validation before creating paid external side effects. In
    // particular, a duplicate or impossible typed combination must not upload
    // images and then fail while building the inventory matrix.
    const inventoryV2 = buildInventoryV2(parsedVariants, parsedInventory, parsedInventoryV2);

    const files = req.files ?? {};
    const images = ['image1', 'image2', 'image3', 'image4']
        .map((field) => files[field]?.[0])
        .filter(Boolean);

    let uploadedAssets = [];
    if (images.length > 0) uploadedAssets = await uploadImages(images);
    const imagesUrl = uploadedAssets.map((asset) => asset.url);

    const product = new productModel({
        name,
        description,
        price,                       // validated positive finite number (ADM-009)
        priceMinor: toMinor(price),  // DB-004
        currency: DEFAULT_CURRENCY,
        brand,
        bestSeller,
        variants: parsedVariants,
        inventory: parsedInventory,
        inventoryV2,
        tags: parsedTags,
        showcase: parsedShowcase,
        image: imagesUrl,
        archived: false,
        date: Date.now(),
    });
    try {
        await product.save();
    } catch (error) {
        await cleanupUploads(uploadedAssets);
        throw error;
    }

    res.status(201).json({success: true, message: "Product Added Successfully"})
});

/**
 * Present a product for a client.
 *
 * `inventory` is served as the **typed array** — the shape that carries the
 * option pairs and can be read in both directions. `inventoryLegacy` carries the
 * old `{ "Black-512GB": 4 }` bag beside it so a client that has not been
 * redeployed still has the field it reads (DB-003, additive rollout).
 */
function presentProduct(product) {
    const plain = typeof product.toObject === 'function' ? product.toObject() : { ...product }
    const entries = entriesOf(plain)
    return {
        ...plain,
        inventory: entries,
        inventoryV2: entries,
        inventoryLegacy: plain.inventory ?? {},
        priceMinor: plain.priceMinor ?? (Number.isFinite(plain.price) ? toMinor(plain.price) : null),
        currency: plain.currency ?? DEFAULT_CURRENCY,
    }
}

// Function for listing Products
const listProduct = asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePaging(req.validated.query);
    const filter = catalogFilter(req.validated.query);

    const [products, total] = await Promise.all([
        productModel.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        productModel.countDocuments(filter),
    ]);

    res.json(paginated('products', products.map(presentProduct), { total, page, limit }))
});

/**
 * Hard delete (ADM-003, DB-007).
 *
 * Refused while any order references the product. That is the whole point:
 * deletion used to be unconditional, so the id stayed in every order line,
 * wishlist and cart for ever. `archive` is the route that is always safe.
 *
 * No Cloudinary call. Removing a remote image is an irreversible side effect on
 * a third-party account, and it is not something a delete endpoint should do
 * without a separate, explicit decision.
 */
/**
 * Hard delete: the refusal, the deletion and the cleanup, or none of them.
 *
 * This used to be three separate operations — count the referencing orders,
 * delete the product, then pull it out of every cart and wishlist — and both
 * gaps were reachable:
 *
 *   * Between the count and the delete a checkout could create an order for the
 *     product. The count said zero, the delete went ahead, and the order was
 *     left pointing at something that no longer exists: the exact drift DB-007
 *     is about, reintroduced by the endpoint meant to prevent it.
 *   * The cleanup ran after the delete and outside any transaction, so a failure
 *     there left the product gone and its id still in every cart.
 *
 * Both are closed here, and the ordering inside the transaction is the load-
 * bearing part: **the product is written to first**. A concurrent checkout
 * reserves stock by updating the product document, so touching it makes that
 * checkout and this deletion contend for the same document — one of them gets a
 * write conflict and retries — instead of passing each other unseen. A snapshot
 * read alone could not do that: two transactions that never write the same
 * document do not conflict, however much they disagree about the world.
 *
 * The marker is rolled back with everything else when the deletion is refused.
 */
const removeProduct = asyncHandler(async (req, res) => {
    const { id } = req.validated.body;

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const product = await productModel.findOneAndUpdate(
                { _id: id },
                { $set: { deleteInProgressAt: new Date() } },
                { session, returnDocument: 'after' },
            );
            if (!product) throw new NotFoundError('Product not found');

            const referencing = await orderModel.countDocuments({ 'items.productId': id }, { session });
            if (referencing > 0) {
                throw new ConflictError('This product appears in existing orders and cannot be deleted. Archive it instead.', {
                    details: `${referencing} order(s) reference product ${id}`,
                });
            }

            // Nothing may point at a product that no longer exists (DB-007),
            // and this happens *before* the delete so the two cannot come apart.
            // Both cart representations, plus the wishlist. Pulling only the
            // legacy map left the canonical line pointing at a product that no
            // longer exists — the drift DB-007 is about, one level down.
            await userModel.updateMany(
                {},
                {
                    $pull: { wishlist: id, cartLines: { productId: String(id) } },
                    $unset: { [`cartData.${id}`]: '' },
                    $inc: { cartVersion: 1 },
                },
                { session },
            );

            await productModel.deleteOne({ _id: id }, { session });
        });
    } finally {
        await session.endSession();
    }

    res.json({success: true, message:"Product Removed"})
});

/** Soft delete. Always safe, because order history no longer reads the catalog. */
const archiveProduct = asyncHandler(async (req, res) => {
    const { id } = req.validated.body;

    const product = await productModel.findByIdAndUpdate(
        id,
        { archived: true, archivedAt: new Date(), archivedBy: req.auth.userId },
        { returnDocument: 'after' },
    )
    if (!product) throw new NotFoundError('Product not found')

    res.json({ success: true, message: 'Product Archived', product: presentProduct(product) })
});

const restoreProduct = asyncHandler(async (req, res) => {
    const { id } = req.validated.body;

    const product = await productModel.findByIdAndUpdate(
        id,
        { archived: false, $unset: { archivedAt: '', archivedBy: '' } },
        { returnDocument: 'after' },
    )
    if (!product) throw new NotFoundError('Product not found')

    res.json({ success: true, message: 'Product Restored', product: presentProduct(product) })
});

// Function for single Product info
const singleProduct = asyncHandler(async (req, res) => {
    const { productId } = req.validated.body;
    const product = await productModel.findOne({
        _id: productId,
        ...catalogFilter({ includeArchived: req.auth?.role === 'admin' }),
    })
    res.json({success: true, product: product ? presentProduct(product) : null})
});

// Function to update product inventory
const updateInventory = asyncHandler(async (req, res) => {
    const { productId, variantKey, variantOptions, quantity } = req.validated.body;

    const product = await productModel.findById(productId);
    if (!product) throw new NotFoundError('Product not found');

    // SEC-018 is unchanged: a key still has to be a combination this product
    // actually has before anything is written. What DB-003 adds is that the
    // lossless form can be sent instead, and that an ambiguous legacy key is
    // refused rather than resolved to whichever entry happens to be first.
    let entry
    try {
        entry = resolveVariant(product, { variantOptions, variantKey })
    } catch (error) {
        if (!(error instanceof VariantResolutionError)) throw error
        if (error.code === 'AMBIGUOUS_VARIANT') {
            throw new ConflictError('That option cannot be identified for this product', {
                details: `legacy key "${error.legacyKey}" is produced by more than one combination`,
            })
        }
        if (variantKey !== undefined) assertVariantKeyBelongsTo(product, variantKey)
        throw new ValidationError('Invalid request', {
            fields: { variantKey: ['is not a variant of this product'] },
        })
    }

    const expectedRevision = product.inventoryRevision ?? 0
    const nextInventoryV2 = entriesOf(product).map((candidate) => ({
        variantId: candidate.variantId,
        legacyKey: candidate.legacyKey,
        options: candidate.options,
        quantity: candidate.variantId === entry.variantId ? quantity : candidate.quantity,
        ...(candidate.sku ? { sku: candidate.sku } : {}),
        ...(candidate.needsReview && candidate.variantId !== entry.variantId ? { needsReview: true } : {}),
    }))
    const updated = await productModel.findOneAndUpdate(
        inventoryRevisionFilter(productId, expectedRevision),
        {
            $set: {
                inventoryV2: nextInventoryV2,
                inventory: legacyInventoryFrom(nextInventoryV2, product.inventory ?? {}),
            },
            $inc: { inventoryRevision: 1 },
        },
        { returnDocument: 'after', runValidators: true },
    )
    if (!updated) throw new ConflictError('Inventory changed while you were editing it. Please reload and try again.')

    res.json({
        success: true,
        message: "Inventory updated successfully",
        product: {
            _id: updated._id,
            name: updated.name,
            inventory: entriesOf(updated),
            inventoryLegacy: updated.inventory,
        }
    });
});

// Function to check product inventory
const checkInventory = asyncHandler(async (req, res) => {
    const { productId } = req.validated.body;

    const product = await productModel.findOne({
        _id: productId,
        ...catalogFilter(),
    }).lean();
    if (!product) throw new NotFoundError('Product not found');

    res.json({
        success: true,
        product: {
            _id: product._id,
            name: product.name,
            archived: Boolean(product.archived),
            inventory: entriesOf(product),
            inventoryLegacy: product.inventory || {},
        }
    });
});

// Function to get products by tag
const getProductsByTag = asyncHandler(async (req, res) => {
    const { tag } = req.validated.params;
    const { page, limit, skip } = resolvePaging(req.validated.query);
    const filter = { ...catalogFilter(req.validated.query), tags: tag };

    const [products, total] = await Promise.all([
        productModel.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        productModel.countDocuments(filter),
    ]);

    res.json(paginated('products', products.map(presentProduct), { total, page, limit }));
});

// Function to get all available tags
const getAllTags = asyncHandler(async (req, res) => {
    // `distinct` rather than loading every product to build a Set in memory
    // (BE-010). The `{ tags: 1 }` index answers it.
    const tags = await productModel.distinct('tags', catalogFilter(req.validated.query));
    res.json({ success: true, tags });
});

// Function to get best seller products
const getBestSellerProducts = asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePaging(req.validated.query);
    const filter = { ...catalogFilter(req.validated.query), bestSeller: true };

    const [products, total] = await Promise.all([
        productModel.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(limit).lean(),
        productModel.countDocuments(filter),
    ]);

    res.json(paginated('products', products.map(presentProduct), { total, page, limit }));
});


/**
 * Build the typed inventory from whichever representation the client sent.
 *
 * Shared by `addProduct` and `updateProduct` so the two cannot drift: V2 is
 * authoritative when present, and the legacy bag is derived from it rather than
 * the other way round (DB-003).
 */
/**
 * The matrix a write should store, or a 400 explaining why it should not.
 *
 * This used to be a bare `.map()` that derived `variantId` from whatever options
 * it was handed and stored the result. It checked nothing: the same combination
 * twice produced two rows with the same canonical identity — read as the first
 * by `resolveVariant`, decremented as **both** by `orderService.reserve`, so one
 * unit sold took two off the shelf — and an option value no axis declares
 * produced a row nothing could ever select. `normaliseInventoryV2` refuses both
 * and completes the matrix; the refusal is the caller's fault, hence 400.
 */
function buildInventoryV2(parsedVariants, parsedInventory, parsedInventoryV2) {
    if (parsedInventoryV2.length === 0) {
        return deriveInventoryV2(parsedVariants, parsedInventory).entries
    }
    try {
        return normaliseInventoryV2(parsedVariants, parsedInventoryV2)
    } catch (error) {
        if (!(error instanceof VariantResolutionError)) throw error
        throw new ValidationError('Invalid request', {
            fields: { inventoryV2: [error.message] },
            details: error.code,
        })
    }
}

/**
 * Partial product update (ADM-002).
 *
 * The console could add and delete and nothing else, so correcting a typo meant
 * deleting the product — orphaning it in every order that referenced it — and
 * creating it again under a new id. This is the endpoint that makes that
 * unnecessary.
 *
 * Three rules, and each exists because the obvious implementation gets it wrong:
 *
 *   * **Absent means unchanged.** Only fields the request actually carries are
 *     written. A PATCH that defaulted its way to a full document would silently
 *     blank everything the form did not send.
 *   * **An untouched image slot keeps its URL.** Editing a name must not mean
 *     re-uploading four photographs, and it must not mean losing them either.
 *     Clearing one is possible, but only by saying so explicitly.
 *   * **Variants and inventory move together.** Changing the axes changes which
 *     combinations exist, so the matrix is rebuilt from the new axes and the
 *     quantities of surviving combinations are carried across.
 *
 * No Cloudinary deletion: replacing an image leaves the old asset in place.
 * Removing a remote file is an irreversible side effect on a third-party
 * account and is not something an edit endpoint should decide to do.
 */
const updateProduct = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const body = req.validated.body;

    const product = await productModel.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    if (body.name !== undefined) product.name = body.name;
    if (body.description !== undefined) product.description = body.description;
    if (body.brand !== undefined) product.brand = body.brand;
    if (body.bestSeller !== undefined) product.bestSeller = body.bestSeller;

    if (body.price !== undefined) {
        product.price = body.price;
        // Set both, and mark the exact one modified so the model's hook treats
        // it as authoritative rather than re-deriving it from the float (DB-004).
        product.priceMinor = toMinor(body.price);
        product.markModified('priceMinor');
    }

    if (body.tags !== undefined) {
        product.tags = parseJsonField(body.tags, tagsShape, 'tags');
    }

    if (body.showcase !== undefined) {
        product.showcase = parseJsonField(body.showcase, showcaseShape, 'showcase');
    }

    // The axes and the matrix are one decision, so they are applied together.
    const changesVariants = body.variants !== undefined
        || body.inventory !== undefined
        || body.inventoryV2 !== undefined;

    if (changesVariants) {
        const currentVariants = product.variants.map((variant) => ({
            name: variant.name,
            options: [...variant.options],
        }));
        const unresolved = deriveInventoryV2(currentVariants, product.inventory ?? {});
        const hasUnresolvedLegacyInventory = entriesOf(product).some((entry) => entry.needsReview)
            || unresolved.ambiguousKeys.length > 0
            || unresolved.orphanKeys.length > 0;
        if (hasUnresolvedLegacyInventory && body.inventoryResolution !== 'resolve') {
            throw new ConflictError(
                'Legacy inventory needs review before variants or quantities can be changed.',
                { details: 'ambiguous and orphan legacy stock was left unchanged' },
            );
        }

        const parsedVariants = body.variants !== undefined
            ? parseJsonField(body.variants, variantsShape, 'variants')
            : product.variants.map((variant) => ({ name: variant.name, options: [...variant.options] }));
        const parsedInventory = body.inventory !== undefined
            ? parseJsonField(body.inventory, inventoryShape, 'inventory')
            : (product.inventory ?? {});
        const parsedInventoryV2 = body.inventoryV2 !== undefined
            ? parseJsonField(body.inventoryV2, inventoryV2Shape, 'inventoryV2')
            : [];

        product.variants = parsedVariants;
        product.inventoryV2 = buildInventoryV2(parsedVariants, parsedInventory, parsedInventoryV2);
        product.inventory = parsedInventory;
        product.markModified('inventoryV2');
        product.markModified('inventory');
        const expectedRevision = product.inventoryRevision ?? 0;
        product.$where = inventoryRevisionFilter(product._id, expectedRevision);
        product.inventoryRevision = expectedRevision + 1;
    }

    // --- images, by slot ---------------------------------------------------
    const files = req.files ?? {};
    const slots = ['image1', 'image2', 'image3', 'image4'];
    const cleared = new Set(parseJsonField(body.clearImages, clearImagesShape, 'clearImages'));

    const uploaded = new Map();
    try {
        for (const [index, field] of slots.entries()) {
            const file = files[field]?.[0];
            if (!file) continue;
            uploaded.set(index, await uploadBuffer(file.buffer));
        }
    } catch {
        await cleanupUploads([...uploaded.values()]);
        throw new AppError('Image upload failed. Please try again.', {
            status: 502,
            code: 'UPLOAD_FAILED',
            details: 'image provider rejected an upload',
        });
    }

    if (uploaded.size > 0 || cleared.size > 0) {
        const existing = Array.isArray(product.image) ? [...product.image] : [];
        const next = [];
        for (let index = 0; index < slots.length; index += 1) {
            if (uploaded.has(index)) { next.push(uploaded.get(index).url); continue; }
            if (cleared.has(index + 1)) continue;
            if (existing[index]) next.push(existing[index]);
        }
        product.image = next;
    }

    try {
        await product.save();
    } catch (error) {
        await cleanupUploads([...uploaded.values()]);
        if (changesVariants && error?.name === 'DocumentNotFoundError') {
            throw new ConflictError('Inventory changed while you were editing it. Please reload and try again.');
        }
        throw error;
    }

    res.json({ success: true, message: 'Product Updated', product: presentProduct(product) });
});

/**
 * Save a whole inventory matrix in one atomic write (ADM-004).
 *
 * The console issued one request per combination, sequentially, aborting on the
 * first failure — so a 3x3 product was nine requests, and a failure on the sixth
 * left five committed and four not. Neither the administrator nor the customer
 * could tell which state the matrix was in.
 *
 * Everything is validated first and written once. An entry naming a combination
 * this product does not have is a 400 and **nothing is written at all**, which
 * is the property the per-request version could not have.
 */
const bulkUpdateInventory = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { entries } = req.validated.body;

    const product = await productModel.findById(id);
    if (!product) throw new NotFoundError('Product not found');

    const current = entriesOf(product);
    const quantities = new Map();

    // Resolve every entry before writing any. SEC-018 is unchanged: a key has
    // to name a combination the product actually has, and an ambiguous legacy
    // key is refused rather than resolved to whichever row happens to be first.
    for (const entry of entries) {
        let resolved;
        try {
            resolved = resolveVariant(product, {
                variantOptions: entry.variantOptions,
                variantKey: entry.variantKey,
            });
        } catch (error) {
            if (!(error instanceof VariantResolutionError)) throw error;
            if (error.code === 'AMBIGUOUS_VARIANT') {
                throw new ConflictError('That option cannot be identified for this product', {
                    details: `legacy key "${error.legacyKey}" is produced by more than one combination`,
                });
            }
            throw new ValidationError('Invalid request', {
                fields: { entries: [`"${entry.variantKey ?? canonicalVariantId(entry.variantOptions)}" is not a variant of this product`] },
            });
        }

        if (quantities.has(resolved.variantId)) {
            throw new ValidationError('Invalid request', {
                fields: { entries: [`"${resolved.variantId}" is named more than once`] },
            });
        }
        quantities.set(resolved.variantId, entry.quantity);
    }

    const nextInventoryV2 = current.map((candidate) => ({
        variantId: candidate.variantId,
        legacyKey: candidate.legacyKey,
        options: candidate.options,
        quantity: quantities.has(candidate.variantId) ? quantities.get(candidate.variantId) : candidate.quantity,
        ...(candidate.sku ? { sku: candidate.sku } : {}),
        // A quantity stated by a person supersedes the migration's "a human
        // must look at this": that is what looking at it produced.
        ...(candidate.needsReview && !quantities.has(candidate.variantId) ? { needsReview: true } : {}),
    }));

    // One write. Both representations are set explicitly because an atomic
    // update bypasses the model hook that would otherwise keep them in step.
    const expectedRevision = product.inventoryRevision ?? 0;
    const updated = await productModel.findOneAndUpdate(
        inventoryRevisionFilter(id, expectedRevision),
        {
            $set: {
                inventoryV2: nextInventoryV2,
                inventory: legacyInventoryFrom(nextInventoryV2, product.inventory ?? {}),
            },
            $inc: { inventoryRevision: 1 },
        },
        { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw new ConflictError('Inventory changed while you were editing it. Please reload and try again.');

    res.json({
        success: true,
        message: 'Inventory updated successfully',
        product: {
            _id: updated._id,
            name: updated.name,
            inventory: entriesOf(updated),
            inventoryLegacy: updated.inventory,
        },
    });
});

export {
    listProduct, addProduct, removeProduct, archiveProduct, restoreProduct, singleProduct,
    updateInventory, bulkUpdateInventory, checkInventory, getProductsByTag, getAllTags, getBestSellerProducts,
    updateProduct, presentProduct,
}
