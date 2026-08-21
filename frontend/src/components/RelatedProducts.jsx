import { useContext, useMemo } from 'react'
import { useParams } from 'react-router-dom'

import { ShopContext } from '../context/shopContext'
import Title from '../components/Title'
import ProductCard from './ProductCard'
import { hasTag } from '../lib/catalog'
import PropTypes from 'prop-types';

// FE-003 / FE-007 — related products were matched on fields the schema lacks.
//
// After a tag pass that required three matches before it would commit, this fell
// back to:
//
//     productsCopy.filter((item) => item.category === category)
//     productsCopy.filter((item) => item.subCategory === subCategory)
//
// Both fields are `undefined` on every product *and* on the product being
// viewed, so the comparison was `undefined === undefined` — true for everything.
// The fallback therefore returned the first five products in the catalog,
// unrelated to anything, and did it silently.
//
// Tags are the relation the schema actually has. The fallback is now the same
// relation with a lower bar rather than a different one, and it says so.

const RELATED_LIMIT = 5

const RelatedProducts = ({ tags = [] }) => {
  const { products } = useContext(ShopContext)
  const { productId } = useParams()

  const related = useMemo(() => {
    const others = products.filter((product) => product._id !== productId)
    if (tags.length === 0) return []

    // Ranked by how many tags they share, so the closest match leads.
    return others
      .map((product) => ({
        product,
        shared: tags.filter((tag) => hasTag(product, tag)).length,
      }))
      .filter((entry) => entry.shared > 0)
      .sort((a, b) => b.shared - a.shared || Number(b.product.date ?? 0) - Number(a.product.date ?? 0))
      .slice(0, RELATED_LIMIT)
      .map((entry) => entry.product)
  }, [products, productId, tags])

  // Nothing genuinely related is shown as nothing, rather than as five arbitrary
  // products presented as recommendations.
  if (related.length === 0) return null

  return (
    <div className='my-24'>
      <div className=' text-center text-3xl py-2'>
        <Title text1={'RELATED'} text2={'PRODUCTS'} />
      </div>

      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 gap-y-6'>
        {related.map((product) => (
          <ProductCard key={product._id} product={product} variant="minimal" />
        ))}
      </div>
    </div>
  )
}

RelatedProducts.propTypes = {
  tags: PropTypes.arrayOf(PropTypes.string),
};

export default RelatedProducts
