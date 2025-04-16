import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from './Title';
import ProductItem from './ProductItem';

const FeaturedCollection = () => {
    const { products } = useContext(ShopContext);
    const [featuredProducts, setFeaturedProducts] = useState([]);

    useEffect(() => {
        setFeaturedProducts(products.slice(0,10));
    }, [products])

    return (
        <div className='my-10'>
            <div className='text-center py-8 text-3xl'>
                <Title text1={'FEATURED'} text2={'COLLECTION'}/>
            </div>

        {/* rendering products */}    
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 gap-y-6'>
            {
                featuredProducts.map((item,index)=>(
                    <ProductItem key={index} id={item._id} image={item.image} name={item.name} price={item.price}/>
                ))
            }
        </div>
        </div>
    )
}

export default FeaturedCollection