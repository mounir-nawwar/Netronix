import { useState } from 'react'
import { toast } from 'react-toastify'

import ProductForm from '../components/ProductForm'
import { createProduct } from '../lib/productRequests'

// ADM-005 / ADM-002 — this page is now a wrapper.
//
// It used to be 619 lines: the form, the variant handlers, the mirrored
// inventory state, the upload rules and the price rule all inlined together —
// which is how a shallow-copy mutation and a stale closure lived in the variant
// matrix without anybody noticing (ADM-005), and why `Edit` could not be added
// without duplicating all of it.
//
// The form is `components/ProductForm`, shared with `Edit`. The rules it applies
// are `lib/productForm`. What is left here is the one thing that is genuinely
// specific to adding: which endpoint to call, and what to do afterwards.

const Add = ({ token }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Remounting the form is how it is cleared after a successful save: the state
  // belongs to the form, so resetting it from outside would mean reaching in.
  const [formKey, setFormKey] = useState(0)

  const handleSubmit = async (payload) => {
    setIsSubmitting(true)
    try {
      const data = await createProduct(payload, token)
      if (data?.success) {
        toast.success(data.message ?? 'Product added')
        setFormKey((key) => key + 1)
      } else {
        toast.error(data?.message ?? 'Could not add the product')
      }
    } catch (error) {
      toast.error(error.response?.data?.message ?? 'Could not add the product')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <ProductForm key={formKey} mode="add" onSubmit={handleSubmit} isSubmitting={isSubmitting} />
}

export default Add
