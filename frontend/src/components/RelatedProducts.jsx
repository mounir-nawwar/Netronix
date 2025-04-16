import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from '../components/Title'
import ProductItem from './ProductItem'
import { useParams } from 'react-router-dom'

const RelatedProducts = ({ category, subCategory, tags = [] }) => {
  const { products } = useContext(ShopContext)
  const [related, setRelated] = useState([])
  const { productId } = useParams()

  useEffect(() => {
    if (products.length > 0) {
      let productsCopy = products.slice()

      // Filter out current product
      productsCopy = productsCopy.filter((item) => item._id !== productId)

      // First try to find products with matching tags if tags exist
      if (tags && tags.length > 0) {
        const tagMatches = productsCopy.filter(product => 
          product.tags && product.tags.some(tag => tags.includes(tag))
        )
        
        // If we found enough tag matches, use those
        if (tagMatches.length >= 3) {
          setRelated(tagMatches.slice(0, 5))
          return
        }
      }
      
      // Otherwise fall back to category and subcategory matching
      productsCopy = productsCopy.filter((item) => item.category === category)
      productsCopy = productsCopy.filter((item) => item.subCategory === subCategory)

      setRelated(productsCopy.slice(0, 5))
    }
  }, [products, productId, tags, category, subCategory])

  return (
    <div className='my-24'>
      <div className=' text-center text-3xl py-2'>
        <Title text1={'RELATED'} text2={'PRODUCTS'} />
      </div>

      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 gap-y-6'>
        {related.map((item, index) => (
          <ProductItem key={index} id={item._id} name={item.name} price={item.price} image={item.image} />
        ))}
      </div>
    </div>
  )
}

export default RelatedProducts