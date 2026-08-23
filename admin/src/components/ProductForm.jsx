import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { FiPlus, FiImage, FiTag, FiPackage, FiInfo, FiDollarSign, FiGrid } from 'react-icons/fi'

import { canonicalVariantId, deriveInventoryV2, effectiveAxes, legacyVariantKey } from '../lib/variant'
import { SHOWCASE_SLOTS } from '../lib/showcase'
import { ACCEPT_ATTRIBUTE, combinationsOf, describeImageProblem, describePriceProblem } from '../lib/productForm'

// ADM-005 / A-6 — the variant matrix is derived, not mirrored.
//
// The defect
// ----------
// Every variant handler in `Add.jsx` did the same three things:
//
//     const newVariants = [...variants];          // shallow copy
//     newVariants[i].options.push(value);         // mutates the ORIGINAL object
//     setVariants(newVariants);
//     updateInventoryKeys();                      // reads `variants` from the
//                                                 // stale closure
//
// The copy is shallow, so `newVariants[i]` is the same object React already
// holds: the push mutates state in place. `addVariantOption` therefore worked
// only *by accident* — `updateInventoryKeys` read the stale `variants`, but the
// mutation had already changed the object it pointed at. `removeVariant` used
// `splice` on the copy, which does not mutate the nested objects, so it was
// genuinely stale and left orphaned inventory combinations behind.
//
// Under `<StrictMode>` — which double-invokes renders and effects to surface
// exactly this — or under concurrent rendering, the accident stops working.
//
// The fix
// -------
// Stop mirroring. `combinations` is a `useMemo` over `variants`, so the matrix
// *cannot* disagree with the axes that generate it; the whole class of bug
// becomes unrepresentable rather than merely fixed. Quantities are keyed by the
// combination's canonical identity (DB-003) and read through that key, so a
// combination that no longer exists is pruned by construction and one that
// survives an unrelated edit keeps its number.
//
// Every handler builds new arrays with **new nested objects** and calls exactly
// one setter. Nothing is mutated and nothing is derived twice.
//
// ADM-002 / A-3 — and this form is shared.
// `Add` and `Edit` render the same component, so the variant logic, the price
// rule, the upload rules and the matrix exist once. Extracting it before adding
// `Edit` is the whole point: duplicating it first and reconciling later is how
// the four divergent product cards happened on the storefront (FE-007).

const IMAGE_SLOTS = [0, 1, 2, 3]

/**
 * A preview URL that is created once per file and revoked when it is replaced
 * or when the form unmounts (ADM-013).
 */
const useObjectUrl = (file) => {
  const url = useMemo(() => (file instanceof File ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

const SectionTitle = ({ icon, title }) => (
  <div className="flex items-center gap-2 mb-4">
    <div className="bg-[#f5f3ff] p-2 rounded-md">{icon}</div>
    <p className='text-lg font-semibold'>{title}</p>
  </div>
)

const ImageSlot = ({ index, file, existingUrl, onSelect, onClear }) => {
  const objectUrl = useObjectUrl(file)
  const preview = objectUrl ?? existingUrl ?? null

  return (
    <div className="block">
      <label htmlFor={`image${index + 1}`} className="block">
        <div className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors relative">
          <span className="sr-only">Choose product image {index + 1}</span>
          {!preview
            ? <FiPlus aria-hidden="true" className="text-xl text-gray-600" />
            : <img className='w-full h-full object-cover rounded-lg' src={preview} alt={`Product image ${index + 1} preview`} />}
        </div>
        <input
          onChange={onSelect}
          accept={ACCEPT_ATTRIBUTE}
          type="file"
          id={`image${index + 1}`}
          className="sr-only"
        />
      </label>
      {preview && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove image ${index + 1}`}
          className="mt-1 text-xs text-gray-500 hover:text-red-500"
        >
          Remove
        </button>
      )}
    </div>
  )
}

const SUGGESTED_TAGS = [
  'Laptops', 'Desktops', 'Monitors', 'Components', 'Peripherals',
  'MacBooks', 'Gaming PCs', 'Headphones', 'Earphones', 'Speakers',
  'CPU', 'GPU', 'Motherboard', 'RAM', 'Storage', 'PSU', 'Cooling',
  'Keyboard', 'Mouse', 'Headset', 'Webcam', 'Speaker',
  'Networking', 'Router', 'Switch', 'Adapter',
  'Accessories', 'Cable', 'Charger', 'Case',
  'Gaming', 'Office', 'Home', 'Student', 'Professional',
  'New Arrivals', 'Best Sellers', 'Clearance', 'Featured',
]

const emptyVariant = () => ({ name: '', options: [] })

const legacyInventoryOf = (product) => {
  if (product?.inventoryLegacy && typeof product.inventoryLegacy === 'object') return product.inventoryLegacy
  if (product?.inventory && !Array.isArray(product.inventory) && typeof product.inventory === 'object') return product.inventory
  return {}
}

const initialVariantsOf = (product) => {
  if (!product) return [emptyVariant()]
  if (product.variants?.length) {
    return product.variants.map((variant) => ({ name: variant.name, options: [...variant.options] }))
  }
  return effectiveAxes([], legacyInventoryOf(product))
}

/**
 * @param {object} props
 * @param {'add'|'edit'} props.mode
 * @param {object|null} props.product  the product being edited, or null
 * @param {(payload: object) => Promise<void>} props.onSubmit
 * @param {boolean} props.isSubmitting
 */
const ProductForm = ({ mode = 'add', product = null, onSubmit, isSubmitting = false }) => {
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : '')
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [bestSeller, setBestSeller] = useState(Boolean(product?.bestSeller))
  const [tags, setTags] = useState(product?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [optionInput, setOptionInput] = useState('')

  const initialVariants = initialVariantsOf(product)
  const [variants, setVariants] = useState(initialVariants)
  const initialLegacyInventory = legacyInventoryOf(product)
  // Always inspect the legacy bag, even when typed entries exist. A migrated
  // product can carry both `needsReview` entries and legacy-only orphan keys;
  // the typed array does not make either safe to discard.
  const initialDerivation = product
    ? deriveInventoryV2(initialVariants, initialLegacyInventory)
    : null
  const hasUnresolvedLegacyInventory = Boolean(
    initialDerivation
      && (
        initialDerivation.ambiguousKeys.length > 0
        || initialDerivation.orphanKeys.length > 0
        || product?.inventoryV2?.some((entry) => entry.needsReview)
      ),
  )
  const [inventoryDirty, setInventoryDirty] = useState(false)
  const [resolvingInventory, setResolvingInventory] = useState(false)
  const [resolutionAcknowledged, setResolutionAcknowledged] = useState(false)

  /**
   * Quantities, keyed by the combination's **canonical identity** (DB-003).
   *
   * Not by the hyphen-joined legacy key: `16-inch` and `RTX-4090` make that
   * string ambiguous, so two different rows of the matrix could share one entry
   * here and silently overwrite each other.
   */
  const initialQuantities = () => {
    const initial = {}
    const entries = product?.inventoryV2?.length
      ? product.inventoryV2
      : deriveInventoryV2(initialVariants, legacyInventoryOf(product)).entries
    for (const entry of entries) {
      initial[entry.variantId ?? canonicalVariantId(entry.options)] = entry.quantity
    }
    return initial
  }
  const [quantities, setQuantities] = useState(initialQuantities)

  const initialPriceDeltas = () => {
    const initial = {}
    const entries = product?.inventoryV2?.length
      ? product.inventoryV2
      : deriveInventoryV2(initialVariants, legacyInventoryOf(product)).entries
    for (const entry of entries) {
      if (entry.priceDelta) initial[entry.variantId ?? canonicalVariantId(entry.options)] = entry.priceDelta
    }
    return initial
  }
  const [priceDeltas, setPriceDeltas] = useState(initialPriceDeltas)

  const [showcase, setShowcase] = useState(
    () => (product?.showcase ?? []).map((entry) => entry.slot),
  )

  /** New files by slot, and which existing URLs are being kept. */
  const [imageFiles, setImageFiles] = useState({})
  const [existingImages, setExistingImages] = useState(product?.image ?? [])
  const [clearedSlots, setClearedSlots] = useState([])

  // The matrix. Derived, so it cannot disagree with the axes (ADM-005).
  const combinations = useMemo(() => combinationsOf(variants), [variants])

  const quantityFor = (combination) => quantities[canonicalVariantId(combination)] ?? ''
  const priceDeltaFor = (combination) => priceDeltas[canonicalVariantId(combination)] ?? ''

  // ---------------------------------------------------------------- variants
  //
  // Every handler below returns a new array containing new nested objects. No
  // `.push`, no `.splice`, no assignment into an object React already holds.

  const setVariantName = (index, value) => {
    setInventoryDirty(true)
    setVariants((previous) => previous.map((variant, position) => (
      position === index ? { ...variant, name: value } : variant
    )))
  }

  const addVariantOption = (index) => {
    const option = optionInput.trim()
    if (option === '' || variants[index]?.options.includes(option)) return

    setInventoryDirty(true)
    setVariants((previous) => previous.map((variant, position) => (
      position === index && !variant.options.includes(option)
        ? { ...variant, options: [...variant.options, option] }
        : variant
    )))
    setOptionInput('')
  }

  const removeVariantOption = (index, optionIndex) => {
    setInventoryDirty(true)
    setVariants((previous) => previous.map((variant, position) => (
      position === index
        ? { ...variant, options: variant.options.filter((_, i) => i !== optionIndex) }
        : variant
    )))
  }

  const addVariant = () => {
    setInventoryDirty(true)
    setVariants((previous) => [...previous, emptyVariant()])
  }

  const removeVariant = (index) => {
    // The matrix recomputes from the remaining axes, so the combinations this
    // axis generated simply stop existing. `splice` on a shallow copy plus a
    // stale `updateInventoryKeys()` used to leave them behind as orphans.
    setInventoryDirty(true)
    setVariants((previous) => previous.filter((_, position) => position !== index))
  }

  const setQuantity = (combination, value) => {
    const key = canonicalVariantId(combination)
    setInventoryDirty(true)
    setQuantities((previous) => ({ ...previous, [key]: Math.max(0, parseInt(value, 10) || 0) }))
  }

  const setPriceDelta = (combination, value) => {
    const key = canonicalVariantId(combination)
    setInventoryDirty(true)
    setPriceDeltas((previous) => ({ ...previous, [key]: value === '' ? '' : parseFloat(value) }))
  }

  // -------------------------------------------------------------------- tags

  const addTag = () => {
    const tag = tagInput.trim()
    if (tag === '') return
    setTags((previous) => (previous.includes(tag) ? previous : [...previous, tag]))
    setTagInput('')
  }

  const toggleSuggestedTag = (tag) => {
    setTags((previous) => (previous.includes(tag) ? previous.filter((t) => t !== tag) : [...previous, tag]))
  }

  const removeTag = (index) => setTags((previous) => previous.filter((_, i) => i !== index))

  const toggleShowcase = (name) => {
    setShowcase((previous) => (previous.includes(name)
      ? previous.filter((entry) => entry !== name)
      : [...previous, name]))
  }

  // ------------------------------------------------------------------ images

  const selectImage = (index) => (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const problem = describeImageProblem(file)
    if (problem) {
      toast.error(problem)
      event.target.value = ''   // let the same file be re-picked after a fix
      return
    }
    setImageFiles((previous) => ({ ...previous, [index]: file }))
    setClearedSlots((previous) => previous.filter((slot) => slot !== index + 1))
  }

  const clearImage = (index) => (event) => {
    event.preventDefault()
    setImageFiles((previous) => {
      const next = { ...previous }
      delete next[index]
      return next
    })
    if (existingImages[index]) {
      setClearedSlots((previous) => (previous.includes(index + 1) ? previous : [...previous, index + 1]))
    }
  }

  // ------------------------------------------------------------------ submit

  const handleSubmit = async (event) => {
    event.preventDefault()

    const priceProblem = describePriceProblem(price)
    if (priceProblem) {
      toast.error(priceProblem)
      return
    }

    if (!variants.every((variant) => variant.name.trim() !== '' && variant.options.length > 0)) {
      toast.error('All variants must have a name and at least one option')
      return
    }

    if (tags.length === 0) {
      toast.error('At least one tag is required for product categorization')
      return
    }

    if (mode === 'edit' && hasUnresolvedLegacyInventory
      && ((inventoryDirty && !resolvingInventory) || (resolvingInventory && !resolutionAcknowledged))) {
      toast.error('Acknowledge the legacy inventory resolution before replacing unresolved quantities.')
      return
    }

    // Only the combinations that currently exist are sent. A removed one is not
    // "set to zero", it is absent — which is what makes pruning correct rather
    // than merely tidy.
    const inventoryV2 = combinations.map((combination) => {
      const key = canonicalVariantId(combination)
      const pd = Number(priceDeltas[key])
      return {
        options: combination,
        quantity: Number(quantities[key]) || 0,
        ...(Number.isFinite(pd) && pd !== 0 ? { priceDelta: pd } : {})
      }
    })
    const inventory = Object.fromEntries(combinations.map((combination) => [
      legacyVariantKey(variants, combination),
      Number(quantities[canonicalVariantId(combination)]) || 0,
    ]))

    const inventoryFields = mode === 'edit' && hasUnresolvedLegacyInventory && !resolvingInventory
      ? {}
      : {
        variants, inventory, inventoryV2,
        ...(resolvingInventory && resolutionAcknowledged ? { inventoryResolution: 'resolve' } : {}),
      }

    await onSubmit({
      name,
      description,
      price,
      brand,
      bestSeller,
      ...inventoryFields,
      tags,
      showcase: showcase.map((slot, order) => ({ slot, order })),
      imageFiles,
      clearImages: clearedSlots,
    })
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setPrice('')
    setBrand('')
    setBestSeller(false)
    setVariants([emptyVariant()])
    setQuantities({})
    setInventoryDirty(false)
    setResolvingInventory(false)
    setResolutionAcknowledged(false)
    setTags([])
    setTagInput('')
    setOptionInput('')
    setShowcase([])
    setImageFiles({})
    setExistingImages([])
    setClearedSlots([])
  }

  ProductForm.reset = resetForm

  return (
    <form onSubmit={handleSubmit} className='flex flex-col w-full items-start gap-5 font-michroma relative pb-20'>
      <div className="w-full flex justify-between items-center mb-2">
        <h1 className="text-2xl font-bold">{mode === 'edit' ? 'Edit Product' : 'Add New Product'}</h1>
      </div>
      <p className="text-gray-500 mb-5">
        {mode === 'edit'
          ? 'Change what needs changing. Anything you leave alone stays as it is.'
          : 'Fill in the information below to add a new product to your inventory.'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 w-full">
        {/* Left Column - Product Information */}
        <div className="w-full bg-white rounded-lg shadow-sm p-6">
          <SectionTitle icon={<FiInfo className="w-5 h-5 text-[#6a5acd]" />} title="Product Information" />

          <div className="mb-5">
            <div className="flex items-center gap-1 mb-2">
              <FiImage className="w-4 h-4 text-[#6a5acd]" />
              <p className='text-sm text-gray-700'>Product Images</p>
            </div>
            <div className='flex gap-2 justify-start'>
              {IMAGE_SLOTS.map((index) => (
                <ImageSlot
                  key={index}
                  index={index}
                  file={imageFiles[index] ?? null}
                  existingUrl={clearedSlots.includes(index + 1) ? null : existingImages[index] ?? null}
                  onSelect={selectImage(index)}
                  onClear={clearImage(index)}
                />
              ))}
            </div>
            {mode === 'edit' && (
              <p className='mt-2 text-xs text-gray-500'>
                Slots you do not touch keep the image they already have.
              </p>
            )}
          </div>

          <div className='w-full mb-4'>
            <label className='mb-2 text-sm text-gray-700 block' htmlFor='product-name'>Product Name</label>
            <input
              id='product-name'
              onChange={(e) => setName(e.target.value)}
              value={name}
              className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all'
              type="text"
              placeholder='Enter product name'
              required
            />
          </div>

          <div className='w-full mb-4'>
            <label className='mb-2 text-sm text-gray-700 block' htmlFor='product-brand'>Brand</label>
            <input
              id='product-brand'
              onChange={(e) => setBrand(e.target.value)}
              value={brand}
              className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all'
              type="text"
              placeholder='Enter product brand'
            />
          </div>

          <div className='w-full mb-4'>
            <label className='mb-2 text-sm text-gray-700 block' htmlFor='product-price'>Product Price ($)</label>
            <div className="flex items-center max-w-[200px] border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 p-2 flex items-center justify-center">
                <FiDollarSign className="text-gray-500" />
              </div>
              <input
                id='product-price'
                onChange={(e) => setPrice(e.target.value)}
                value={price}
                className='flex-1 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all border-0'
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Enter price"
                required
              />
            </div>
          </div>

          <div className='w-full mb-4'>
            <label className='mb-2 text-sm text-gray-700 block' htmlFor='product-description'>Product Description</label>
            <textarea
              id='product-description'
              onChange={(e) => setDescription(e.target.value)}
              value={description}
              className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all min-h-[150px]'
              placeholder='Enter product description'
              required
            />
          </div>

          <div className='w-full pt-2 border-t border-gray-200'>
            <div className='flex items-center gap-2'>
              <input
                onChange={() => setBestSeller((previous) => !previous)}
                checked={bestSeller}
                type="checkbox"
                id='bestSeller'
                className='w-5 h-5 accent-[#6a5acd] cursor-pointer'
              />
              <label className='cursor-pointer text-gray-700' htmlFor="bestSeller">Mark as Featured Product</label>
            </div>
          </div>

          {/* FE-004 — which homepage surfaces this product belongs to. The
              storefront used to name its products by literal ObjectId, so this
              was not an editorial decision anybody could make; it was a code
              change and a redeploy. */}
          <div className='w-full pt-4 mt-4 border-t border-gray-200'>
            <p className='text-sm text-gray-700 mb-2'>Homepage placement</p>
            <div className='flex flex-wrap gap-2'>
              {SHOWCASE_SLOTS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleShowcase(name)}
                  aria-pressed={showcase.includes(name)}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    showcase.includes(name) ? 'bg-[#6a5acd] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Tags and Variants */}
        <div className="space-y-5">
          <div className='w-full bg-white rounded-lg shadow-sm p-6'>
            <SectionTitle icon={<FiTag className="w-5 h-5 text-[#6a5acd]" />} title="Product Collections (Tags)" />
            <p className='text-gray-500 mb-3 text-sm'>Tags are used to categorize and filter products. Add at least one tag.</p>

            <div className='flex mb-3'>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                className='flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all'
                type="text"
                placeholder='Enter custom tag'
                aria-label='Custom tag'
              />
              <button type="button" onClick={addTag} className='px-4 py-2 bg-[#6a5acd] text-white rounded-r-lg hover:bg-[#5a4cbb] transition-colors'>
                Add
              </button>
            </div>

            <div className='mb-4'>
              <p className='mb-2 text-sm text-gray-700'>Suggested Collections:</p>
              <div className='flex flex-wrap gap-2'>
                {SUGGESTED_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleSuggestedTag(tag)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                      tags.includes(tag) ? 'bg-[#6a5acd] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {tags.length > 0 && (
              <div>
                <p className='mb-2 text-sm text-gray-700'>Selected Collections:</p>
                <div className='flex flex-wrap gap-2 mt-2'>
                  {tags.map((tag, index) => (
                    <div key={tag} className='flex items-center bg-[#f5f3ff] px-3 py-1 rounded-full'>
                      <span className='text-[#6a5acd]'>{tag}</span>
                      <button
                        type="button"
                        onClick={() => removeTag(index)}
                        aria-label={`Remove tag ${tag}`}
                        className='ml-2 text-[#6a5acd] hover:text-[#5a4cbb]'
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className='w-full bg-white rounded-lg shadow-sm p-6'>
            <div className='flex items-center justify-between mb-4'>
              <SectionTitle icon={<FiGrid className="w-5 h-5 text-[#6a5acd]" />} title="Product Variants" />
              <button
                type="button"
                onClick={addVariant}
                className='px-3 py-1.5 bg-[#6a5acd] text-white rounded-lg hover:bg-[#5a4cbb] transition-colors text-sm flex items-center gap-1'
              >
                <FiPlus className="w-4 h-4" />
                Add Variant
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
              {variants.map((variant, variantIndex) => (
                <div key={variantIndex} className='p-4 border border-gray-200 rounded-lg bg-gray-50'>
                  <div className='flex justify-between items-center mb-3'>
                    <div className='flex-1 mr-2'>
                      <p className='text-sm mb-1 text-gray-700'>Variant Name (e.g. &quot;Size&quot;, &quot;Color&quot;)</p>
                      <input
                        value={variant.name}
                        onChange={(e) => setVariantName(variantIndex, e.target.value)}
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all'
                        type="text"
                        placeholder='Enter variant name'
                        aria-label={`Variant ${variantIndex + 1} name`}
                        required
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeVariant(variantIndex)}
                      aria-label={`Remove variant ${variant.name || variantIndex + 1}`}
                      className='ml-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm'
                    >
                      Remove
                    </button>
                  </div>

                  <div className='mt-3'>
                    <p className='text-sm mb-1 text-gray-700'>Variant Options (e.g. &quot;S&quot;, &quot;M&quot;, &quot;L&quot; or &quot;Red&quot;, &quot;Blue&quot;)</p>
                    <div className='flex'>
                      <input
                        value={optionInput}
                        onChange={(e) => setOptionInput(e.target.value)}
                        className='flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all'
                        type="text"
                        placeholder='Enter option value'
                        aria-label={`Option value for variant ${variantIndex + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => addVariantOption(variantIndex)}
                        className='px-4 py-2 bg-[#6a5acd] text-white rounded-r-lg hover:bg-[#5a4cbb] transition-colors'
                      >
                        Add
                      </button>
                    </div>

                    <div className='flex flex-wrap gap-2 mt-3'>
                      {variant.options.map((option, optionIndex) => (
                        <div key={option} className='flex items-center bg-[#f5f3ff] px-3 py-1 rounded-full'>
                          <span className="text-[#6a5acd]">{option}</span>
                          <button
                            type="button"
                            onClick={() => removeVariantOption(variantIndex, optionIndex)}
                            aria-label={`Remove option ${option}`}
                            className='ml-2 text-[#6a5acd] hover:text-[#5a4cbb]'
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory Management. The rows are the derived matrix; the labels
              and the layout are exactly what they were (20 § Preserve). */}
          {combinations.length > 0 && (
            <div className='w-full bg-white rounded-lg shadow-sm p-6'>
              <SectionTitle icon={<FiPackage className="w-5 h-5 text-[#6a5acd]" />} title="Inventory Management" />

              <div className="max-h-[400px] overflow-y-auto pr-2">
                <div className='grid grid-cols-1 gap-3'>
                  {combinations.map((combination) => {
                    const label = Object.values(combination).join(' / ') || 'Default'
                    return (
                      <div key={canonicalVariantId(combination)} className='flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-[#6a5acd] transition-colors'>
                        <span className='font-medium text-gray-700 flex-1'>{label}:</span>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={priceDeltaFor(combination)}
                            onChange={(e) => setPriceDelta(combination, e.target.value)}
                            aria-label={`Price delta for ${label}`}
                            className='w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all'
                            placeholder="+ Price"
                          />
                          <input
                            type="number"
                            min="0"
                            value={quantityFor(combination)}
                            onChange={(e) => setQuantity(combination, e.target.value)}
                            aria-label={`Quantity for ${label}`}
                            className='w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-all'
                            placeholder="Qty"
                            required
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {mode === 'edit' && hasUnresolvedLegacyInventory && (
        <div role="alert" className="w-full rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-semibold">Legacy inventory needs review</h2>
          <p className="mt-1 text-sm">These entries cannot be resolved automatically and are preserved until you explicitly replace them.</p>
          {initialDerivation.ambiguousKeys.length > 0 && (
            <p className="mt-2 text-sm"><strong>Ambiguous keys:</strong> {initialDerivation.ambiguousKeys.join(', ')}</p>
          )}
          {initialDerivation.orphanKeys.length > 0 && (
            <p className="mt-1 text-sm"><strong>Orphan keys:</strong> {initialDerivation.orphanKeys.join(', ')}</p>
          )}
          {product?.inventoryV2?.some((entry) => entry.needsReview) && (
            <p className="mt-1 text-sm"><strong>Needs review:</strong> {product.inventoryV2.filter((entry) => entry.needsReview).map((entry) => entry.legacyKey ?? entry.variantId).join(', ')}</p>
          )}

          {!resolvingInventory ? (
            <button
              type="button"
              onClick={() => setResolvingInventory(true)}
              className="mt-4 rounded bg-amber-800 px-4 py-2 text-white"
            >
              Resolve legacy inventory
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={resolutionAcknowledged}
                  onChange={(event) => setResolutionAcknowledged(event.target.checked)}
                />
                <span>I understand submitted quantities replace unresolved entries and orphan keys are removed.</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setVariants(initialVariants)
                  setQuantities(initialQuantities())
                  setPriceDeltas(initialPriceDeltas())
                  setInventoryDirty(false)
                  setResolutionAcknowledged(false)
                  setResolvingInventory(false)
                }}
                className="rounded border border-amber-800 px-4 py-2 text-amber-900"
              >
                Cancel resolution
              </button>
            </div>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 z-10 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {mode === 'edit' ? 'Save to apply your changes' : 'Fill all required fields to add a new product'}
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className='px-6 py-3 bg-[#6a5acd] text-white rounded-lg hover:bg-[#5a4cbb] transition-colors flex items-center gap-2 disabled:opacity-70'
          >
            {isSubmitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />}
            {isSubmitting
              ? (mode === 'edit' ? 'Saving…' : 'Adding Product...')
              : (mode === 'edit' ? 'Save Changes' : 'Add Product')}
          </button>
        </div>
      </div>
    </form>
  )
}

export default ProductForm
