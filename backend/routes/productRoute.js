import express from 'express'
import {
    listProduct, addProduct, removeProduct, archiveProduct, restoreProduct, singleProduct,
    updateInventory, bulkUpdateInventory, checkInventory, getProductsByTag, getAllTags, getBestSellerProducts,
    updateProduct,
} from '../controllers/productController.js'
import upload, { validateImageContent } from '../middleware/multer.js';
import adminAuth, { adminAuthForArchivedQuery, optionalAdminAuth } from '../middleware/adminAuth.js';
import { validate } from '../middleware/validate.js';
import {
    addProductSchema,
    removeProductSchema,
    archiveProductSchema,
    singleProductSchema,
    updateInventorySchema,
    checkInventorySchema,
    productsByTagSchema,
    listProductSchema,
    tagsSchema,
    updateProductSchema,
    bulkInventorySchema,
} from '../validators/product.js';

const productRouter = express.Router();

// Order matters on the multipart route: `upload` has to run before `validate`,
// because until multer has parsed the body there are no text fields to check.
productRouter.post(
    '/add',
    adminAuth,
    upload.fields([{name: 'image1' , maxCount: 1}, {name: 'image2' , maxCount: 1}, {name: 'image3' , maxCount: 1}, {name: 'image4' , maxCount: 1}]),
    validateImageContent,
    validate(addProductSchema),
    addProduct,
);
productRouter.post('/remove', adminAuth, validate(removeProductSchema), removeProduct);
// Soft delete and its inverse (DB-007, ADM-003). `remove` is refused while an
// order references the product; these two are always safe.
productRouter.post('/archive', adminAuth, validate(archiveProductSchema), archiveProduct);
productRouter.post('/restore', adminAuth, validate(archiveProductSchema), restoreProduct);
productRouter.post('/single', validate(singleProductSchema), optionalAdminAuth, singleProduct);
// Every listing is bounded and deterministically sorted (BE-009).
productRouter.get('/list', validate(listProductSchema), adminAuthForArchivedQuery, listProduct);
productRouter.post('/update-inventory', adminAuth, validate(updateInventorySchema), updateInventory);
productRouter.post('/check-inventory', validate(checkInventorySchema), checkInventory);
productRouter.get('/tags/:tag', validate(productsByTagSchema), adminAuthForArchivedQuery, getProductsByTag);
productRouter.get('/tags', validate(tagsSchema), adminAuthForArchivedQuery, getAllTags);
productRouter.get('/best-sellers', validate(listProductSchema), adminAuthForArchivedQuery, getBestSellerProducts);

// Partial product update (ADM-002) and the whole inventory matrix in one atomic
// write (ADM-004). Both are declared last: `/:id` is the least specific pattern
// on this router, and Express matches in declaration order, so putting it above
// `/list` or `/tags` would swallow them.
productRouter.post(
    '/:id/inventory',
    adminAuth,
    validate(bulkInventorySchema),
    bulkUpdateInventory,
);
productRouter.patch(
    '/:id',
    adminAuth,
    upload.fields([{name: 'image1' , maxCount: 1}, {name: 'image2' , maxCount: 1}, {name: 'image3' , maxCount: 1}, {name: 'image4' , maxCount: 1}]),
    validateImageContent,
    validate(updateProductSchema),
    updateProduct,
);

export default productRouter;
