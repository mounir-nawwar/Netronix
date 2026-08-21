import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'

import ProductForm from '../components/ProductForm'
import { fetchProduct, updateProduct } from '../lib/productRequests'

// ADM-002 — the admin's most conspicuous gap.
//
// The console could add and delete, and nothing else. There was no PUT or PATCH
// route and no edit UI, so correcting a typo meant **deleting the product** —
// which orphaned its id in every order line, wishlist and cart that referenced
// it (DB-007) — and creating it again under a new id, losing its history.
//
// This is the same form `Add` renders, loaded with the product as it stands.

const Edit = ({ token }) => {
  const { id } = useParams()
  const navigate = useNavigate()

  const [product, setProduct] = useState(null)
  const [status, setStatus] = useState('loading')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setStatus('loading')
      try {
        const found = await fetchProduct(id)
        if (cancelled) return
        if (!found) { setStatus('missing'); return }
        setProduct(found)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    load()
    return () => { cancelled = true }
  }, [id])

  const handleSubmit = async (payload) => {
    setIsSubmitting(true)
    try {
      const data = await updateProduct(id, payload, token)
      if (data?.success) {
        toast.success(data.message ?? 'Product updated')
        navigate('/list')
      } else {
        toast.error(data?.message ?? 'Could not save your changes')
      }
    } catch (error) {
      toast.error(error.response?.data?.message ?? 'Could not save your changes')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className='flex items-center justify-center py-24' role='status' aria-live='polite'>
        <span className='inline-block h-8 w-8 border-2 border-[#6a5acd] border-t-transparent rounded-full animate-spin' />
        <span className='sr-only'>Loading the product…</span>
      </div>
    )
  }

  if (status !== 'ready') {
    return (
      <div className='py-24 text-center' role='alert'>
        <h1 className='text-2xl font-bold mb-2'>
          {status === 'missing' ? 'That product does not exist' : 'We could not load that product'}
        </h1>
        <p className='text-gray-500 mb-6'>
          {status === 'missing'
            ? 'It may have been deleted. Archived products can be restored from the product list.'
            : 'Please try again in a moment.'}
        </p>
        <button
          type='button'
          onClick={() => navigate('/list')}
          className='px-6 py-3 bg-[#6a5acd] text-white rounded-lg hover:bg-[#5a4cbb] transition-colors'
        >
          Back to products
        </button>
      </div>
    )
  }

  return <ProductForm mode="edit" product={product} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
}

export default Edit
