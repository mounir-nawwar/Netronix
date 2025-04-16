import React, { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import { RiArrowDownSLine } from "react-icons/ri";
import Title from '../components/Title';
import ProductItem from '../components/ProductItem';
import { useParams, Link } from 'react-router-dom';

const Collection = () => {

    const { products, search, showSearch } = useContext(ShopContext);
    const [showFilter, setShowFilter] = useState(false);
    const [filterProducts, setFilterProducts] = useState([]);
    const [category, setCategory] = useState([]);
    const [subCategory, setSubCategory] = useState([]);
    const [sortType, setSortType] = useState('relavant');
    const [availableTags, setAvailableTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    
    // Get URL parameters
    const params = useParams();
    const { tag, category: urlCategory, subCategory: urlSubCategory } = params;

    // Extract all unique tags from products
    useEffect(() => {
        if (products.length > 0) {
            const tags = new Set();
            products.forEach(product => {
                if (product.tags && Array.isArray(product.tags)) {
                    product.tags.forEach(tag => tags.add(tag));
                }
            });
            setAvailableTags(Array.from(tags));
        }
    }, [products]);

    // Set initial filters based on URL parameters
    useEffect(() => {
        if (urlCategory) {
            setCategory([urlCategory]);
        }
        
        if (urlSubCategory) {
            setSubCategory([urlSubCategory]);
        }
        
        if (tag) {
            setSelectedTags([tag]);
        }
    }, [urlCategory, urlSubCategory, tag]);

    const toggleCategory = (e) => {
        if (category.includes(e.target.value)) {
            setCategory(prev => prev.filter(item => item !== e.target.value))
        }
        else {
            setCategory(prev => [...prev, e.target.value])
        }
    }

    const toggleSubCategory = (e) => {
        if (subCategory.includes(e.target.value)) {
            setSubCategory(prev => prev.filter(item => item !== e.target.value))
        }
        else {
            setSubCategory(prev => [...prev, e.target.value])
        }
    }

    const toggleTag = (tagName) => {
        if (selectedTags.includes(tagName)) {
            setSelectedTags(prev => prev.filter(item => item !== tagName));
        } else {
            setSelectedTags(prev => [...prev, tagName]);
        }
    }

    const applyFilter = () => {
        let productsCopy = products.slice();
        
        // Filter by search
        if (showSearch && search) {
            productsCopy = productsCopy.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
        }
        
        // Filter by category
        if (category.length > 0) {
            productsCopy = productsCopy.filter(item => category.includes(item.category));
        }
        
        // Filter by subcategory
        if (subCategory.length > 0) {
            productsCopy = productsCopy.filter(item => subCategory.includes(item.subCategory));
        }
        
        // Filter by tags
        if (selectedTags.length > 0) {
            productsCopy = productsCopy.filter(item => 
                item.tags && selectedTags.some(tag => item.tags.includes(tag))
            );
        }

        setFilterProducts(productsCopy);
    }

    const sortProducts = () => {
        let fpCopy = filterProducts.slice();

        switch (sortType) {
            case 'low-high':
                setFilterProducts(fpCopy.sort((a, b) => (a.price - b.price)));
                break;
            case 'high-low':
                setFilterProducts(fpCopy.sort((a, b) => (b.price - a.price)));
                break;
            default:
                applyFilter();
                break;
        }
    }

    useEffect(() => {
        applyFilter();
    }, [category, subCategory, search, showSearch, products, selectedTags]);

    useEffect(() => {
        sortProducts();
    }, [sortType]);

    // Determine page title based on filters
    const getPageTitle = () => {
        if (tag) {
            return `${tag}`;
        } else if (urlCategory && urlSubCategory) {
            return `${urlSubCategory} for ${urlCategory}`;
        } else if (urlCategory) {
            return `${urlCategory}'s Collection`;
        } else {
            return 'ALL COLLECTIONS';
        }
    };

    return (
        <div className="px-4 sm:px-[5vw] md:px-[7vw] lg:px-[9vw] flex flex-col sm:flex-row gap-10 pt-10 border-t">
            {/* Filter Options */}
            <div className='min-w-60'>
                <p onClick={() => setShowFilter(!showFilter)} className='my-2 text-xl flex items-center cursor-pointer gap-2'>FILTERS
                    <RiArrowDownSLine className={`h-4 text-gray-400 sm:hidden ${showFilter ? '' : 'rotate-[270deg]'}`} />
                </p>

                {/* Category Filter */}
                <div className={`border border-gray-300 pl-5 py-3 mt-6 ${showFilter ? '' : 'hidden'} sm:block`}>
                    <p className='mb-3 text-sm font-medium'>CATEGORY</p>
                    <div className='flex flex-col gap-2 text-sm font-light text-gray-700'>
                        <p className='flex gap-2'>
                            <input 
                                className='w-3' 
                                type="checkbox" 
                                value={'Men'} 
                                onChange={toggleCategory}
                                checked={category.includes('Men')}
                            /> Men
                        </p>
                        <p className='flex gap-2'>
                            <input 
                                className='w-3' 
                                type="checkbox" 
                                value={'Women'} 
                                onChange={toggleCategory}
                                checked={category.includes('Women')}
                            /> Women
                        </p>
                        <p className='flex gap-2'>
                            <input 
                                className='w-3' 
                                type="checkbox" 
                                value={'Kids'} 
                                onChange={toggleCategory}
                                checked={category.includes('Kids')}
                            /> Kids
                        </p>
                    </div>
                </div>
                
                {/* Subcategory Filter */}
                <div className={`border border-gray-300 pl-5 py-3 my-5 ${showFilter ? '' : 'hidden'} sm:block`}>
                    <p className='mb-3 text-sm font-medium'>TYPE</p>
                    <div className='flex flex-col gap-2 text-sm font-light text-gray-700'>
                        <p className='flex gap-2'>
                            <input 
                                className='w-3' 
                                type="checkbox" 
                                value={'Topwear'} 
                                onChange={toggleSubCategory}
                                checked={subCategory.includes('Topwear')}
                            /> Topwear
                        </p>
                        <p className='flex gap-2'>
                            <input 
                                className='w-3' 
                                type="checkbox" 
                                value={'Bottomwear'} 
                                onChange={toggleSubCategory}
                                checked={subCategory.includes('Bottomwear')}
                            /> Bottomwear
                        </p>
                        <p className='flex gap-2'>
                            <input 
                                className='w-3' 
                                type="checkbox" 
                                value={'Winterwear'} 
                                onChange={toggleSubCategory}
                                checked={subCategory.includes('Winterwear')}
                            /> Winterwear
                        </p>
                    </div>
                </div>
                
                {/* Tags Filter */}
                {availableTags.length > 0 && (
                    <div className={`border border-gray-300 pl-5 py-3 my-5 ${showFilter ? '' : 'hidden'} sm:block`}>
                        <p className='mb-3 text-sm font-medium'>TAGS</p>
                        <div className='flex flex-col gap-2 text-sm font-light text-gray-700'>
                            {availableTags.map((tag, index) => (
                                <p className='flex gap-2' key={index}>
                                    <input 
                                        className='w-3' 
                                        type="checkbox" 
                                        checked={selectedTags.includes(tag)}
                                        onChange={() => toggleTag(tag)}
                                    /> {tag}
                                </p>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Side */}
            <div className='flex-1'>
                <div className='flex justify-between text-base sm:text-2xl mb-4'>
                    <Title text1={getPageTitle()} text2={''} />
                    {/* Product Sort */}
                    <select 
                        onChange={(e) => setSortType(e.target.value)}
                        value={sortType}
                        className='border-2 border-gray-300 text-sm px-2'
                    >
                        <option value="relavant">Sort By: Relevant</option>
                        <option value="low-high">Sort By: Low to High</option>
                        <option value="high-low">Sort By: High to Low</option>
                    </select>
                </div>
                
                {/* Selected Filters */}
                {(category.length > 0 || subCategory.length > 0 || selectedTags.length > 0) && (
                    <div className='mb-4 flex flex-wrap gap-2'>
                        {category.map(cat => (
                            <div key={cat} className='bg-gray-100 px-2 py-1 rounded-full text-sm flex items-center'>
                                {cat}
                                <button 
                                    className='ml-2 text-gray-500'
                                    onClick={() => setCategory(prev => prev.filter(item => item !== cat))}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        
                        {subCategory.map(subCat => (
                            <div key={subCat} className='bg-gray-100 px-2 py-1 rounded-full text-sm flex items-center'>
                                {subCat}
                                <button 
                                    className='ml-2 text-gray-500'
                                    onClick={() => setSubCategory(prev => prev.filter(item => item !== subCat))}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        
                        {selectedTags.map(tag => (
                            <div key={tag} className='bg-blue-100 px-2 py-1 rounded-full text-sm flex items-center'>
                                {tag}
                                <button 
                                    className='ml-2 text-gray-500'
                                    onClick={() => setSelectedTags(prev => prev.filter(item => item !== tag))}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        
                        <button 
                            className='text-sm text-blue-600 underline'
                            onClick={() => {
                                setCategory([]);
                                setSubCategory([]);
                                setSelectedTags([]);
                            }}
                        >
                            Clear All
                        </button>
                    </div>
                )}
                
                {/* Product Results Count */}
                <div className='mb-4 text-sm text-gray-500'>
                    {filterProducts.length} products found
                </div>
                
                {/* Map Products */}
                <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 gap-y-6'>
                    {
                        filterProducts.map((item, index) => (
                            <ProductItem key={index} name={item.name} id={item._id} price={item.price} image={item.image} />
                        ))
                    }
                </div>
                
                {/* No Results Message */}
                {filterProducts.length === 0 && (
                    <div className='text-center py-10'>
                        <p className='text-gray-500'>No products found matching your criteria.</p>
                        <button 
                            className='mt-4 text-blue-600 underline'
                            onClick={() => {
                                setCategory([]);
                                setSubCategory([]);
                                setSelectedTags([]);
                            }}
                        >
                            Clear All Filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Collection;