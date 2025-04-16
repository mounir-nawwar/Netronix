import React, { useState } from 'react'
import { assets } from '../assets/assets'
import axios from 'axios'
import { backendUrl } from '../App'
import { toast } from 'react-toastify'

const Add = ({ token }) => {

  const [image1, setImage1] = useState(false)
  const [image2, setImage2] = useState(false)
  const [image3, setImage3] = useState(false)
  const [image4, setImage4] = useState(false)

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [bestSeller, setBestSeller] = useState(false);
  
  // Replace sizes with variants
  const [variants, setVariants] = useState([{ name: '', options: [] }]);
  // New state for inventory
  const [inventory, setInventory] = useState({});
  // New state for tags
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  // Predefined tag categories
  const suggestedTags = ['Electronics', 'Accessories', 'Featured', 'New Arrivals', 'Best Sellers', 'Clearance', 'Mobile', 'Computers', 'Audio', 'Wearables'];

  const onSubmitHandler = async (e) => {
    e.preventDefault();

    try {
      // Validate that all variants have a name and at least one option
      const isVariantsValid = variants.every(variant => 
        variant.name.trim() !== '' && variant.options.length > 0
      );

      if (!isVariantsValid) {
        toast.error('All variants must have a name and at least one option');
        return;
      }

      // Validate that at least one tag is selected
      if (tags.length === 0) {
        toast.error('At least one tag is required for product categorization');
        return;
      }

      const formData = new FormData();

      formData.append("name", name)
      formData.append("description", description)
      formData.append("price", price)
      formData.append("bestSeller", bestSeller)
      formData.append("variants", JSON.stringify(variants))
      formData.append("inventory", JSON.stringify(inventory))
      formData.append("tags", JSON.stringify(tags))
      if (image1) formData.append("image1", image1);
      if (image2) formData.append("image2", image2);
      if (image3) formData.append("image3", image3);
      if (image4) formData.append("image4", image4);

      const response = await axios.post(backendUrl + "/api/product/add", formData, { headers: { token } })
      console.log(response.data);
      

      if (response.data.success) {
        toast.success(response.data.message)
        setName('')
        setDescription('')
        setPrice('')
        setBestSeller(false);
        setVariants([{ name: '', options: [] }]);
        setInventory({});
        setTags([]);
        setTagInput('');
        setImage1(false);
        setImage2(false);
        setImage3(false);
        setImage4(false);
      } else {
        toast.error(response.data.message)
      }

    } catch (error) {
      console.log(error);
      toast.error(error.message)
    }
  }

  // Handle variant name change
  const handleVariantNameChange = (index, value) => {
    const newVariants = [...variants];
    newVariants[index].name = value;
    setVariants(newVariants);
  };

  // Handle variant option input
  const [optionInput, setOptionInput] = useState('');
  
  // Add variant option
  const addVariantOption = (variantIndex) => {
    if (optionInput.trim() === '') return;
    
    const newVariants = [...variants];
    if (!newVariants[variantIndex].options.includes(optionInput)) {
      newVariants[variantIndex].options.push(optionInput);
      setVariants(newVariants);
    }
    setOptionInput('');
    
    // Update inventory for the new variants
    updateInventoryKeys();
  };

  // Remove variant option
  const removeVariantOption = (variantIndex, optionIndex) => {
    const newVariants = [...variants];
    newVariants[variantIndex].options.splice(optionIndex, 1);
    setVariants(newVariants);
    
    // Update inventory for the new variants
    updateInventoryKeys();
  };

  // Add variant
  const addVariant = () => {
    setVariants([...variants, { name: '', options: [] }]);
  };

  // Remove variant
  const removeVariant = (index) => {
    if (variants.length === 1) {
      toast.error('At least one variant is required');
      return;
    }
    const newVariants = [...variants];
    newVariants.splice(index, 1);
    setVariants(newVariants);
    
    // Update inventory for the new variants
    updateInventoryKeys();
  };

  // Generate all possible combinations of variant options
  const generateVariantCombinations = () => {
    if (variants.length === 0 || variants.some(v => v.options.length === 0)) {
      return [];
    }

    // Get all options arrays
    const optionsArrays = variants.map(v => v.options);
    
    // Generate combinations recursively
    const generateCombos = (arrays, current = [], index = 0) => {
      if (index === arrays.length) {
        return [current];
      }
      
      let result = [];
      for (let i = 0; i < arrays[index].length; i++) {
        result = result.concat(
          generateCombos(arrays, [...current, arrays[index][i]], index + 1)
        );
      }
      return result;
    };
    
    return generateCombos(optionsArrays);
  };

  // Generate inventory key from variant combination
  const getInventoryKey = (combination) => {
    return combination.join('-');
  };

  // Update inventory keys when variants change
  const updateInventoryKeys = () => {
    const combinations = generateVariantCombinations();
    const newInventory = {};
    
    // Preserve existing inventory values if the combination still exists
    combinations.forEach(combo => {
      const key = getInventoryKey(combo);
      newInventory[key] = inventory[key] || 0;
    });
    
    setInventory(newInventory);
  };

  // Handle inventory change for a specific variant combination
  const handleInventoryChange = (key, quantity) => {
    setInventory(prev => ({
      ...prev,
      [key]: parseInt(quantity) || 0
    }));
  };

  // Add tag
  const addTag = () => {
    if (tagInput.trim() === '') return;
    if (!tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
    }
    setTagInput('');
  };

  // Add suggested tag
  const addSuggestedTag = (tag) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  // Remove tag
  const removeTag = (index) => {
    const newTags = [...tags];
    newTags.splice(index, 1);
    setTags(newTags);
  };

  // Handle tag input key press (add on Enter)
  const handleTagKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <form onSubmit={onSubmitHandler} className='flex flex-col w-full items-start gap-5 font-michroma'>
      <h1 className="text-2xl font-bold mb-5">Add New Product</h1>
      <div className="w-full bg-white rounded-lg shadow-md p-6 mb-5">
        <p className='mb-4 text-lg font-semibold'>Upload Product Images</p>

        <div className='flex gap-3'>
          <label htmlFor="image1" className="block">
            <div className="w-24 h-24 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              {!image1 ? (
                <span className="text-3xl text-gray-400">+</span>
              ) : (
                <img className='w-full h-full object-cover rounded-lg' src={URL.createObjectURL(image1)} alt="" />
              )}
            </div>
            <input onChange={(e) => setImage1(e.target.files[0])} type="file" id='image1' className="hidden" />
          </label>
          
          <label htmlFor="image2" className="block">
            <div className="w-24 h-24 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              {!image2 ? (
                <span className="text-3xl text-gray-400">+</span>
              ) : (
                <img className='w-full h-full object-cover rounded-lg' src={URL.createObjectURL(image2)} alt="" />
              )}
            </div>
            <input onChange={(e) => setImage2(e.target.files[0])} type="file" id='image2' className="hidden" />
          </label>
          
          <label htmlFor="image3" className="block">
            <div className="w-24 h-24 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              {!image3 ? (
                <span className="text-3xl text-gray-400">+</span>
              ) : (
                <img className='w-full h-full object-cover rounded-lg' src={URL.createObjectURL(image3)} alt="" />
              )}
            </div>
            <input onChange={(e) => setImage3(e.target.files[0])} type="file" id='image3' className="hidden" />
          </label>
          
          <label htmlFor="image4" className="block">
            <div className="w-24 h-24 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              {!image4 ? (
                <span className="text-3xl text-gray-400">+</span>
              ) : (
                <img className='w-full h-full object-cover rounded-lg' src={URL.createObjectURL(image4)} alt="" />
              )}
            </div>
            <input onChange={(e) => setImage4(e.target.files[0])} type="file" id='image4' className="hidden" />
          </label>
        </div>
      </div>

      <div className="w-full bg-white rounded-lg shadow-md p-6 mb-5">
        <p className='mb-4 text-lg font-semibold'>Product Information</p>
        
        <div className='w-full mb-4'>
          <p className='mb-2'>Product Name</p>
          <input 
            onChange={(e) => setName(e.target.value)} 
            value={name} 
            className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500' 
            type="text" 
            placeholder='Enter product name' 
            required 
          />
        </div>

        <div className='w-full mb-4'>
          <p className='mb-2'>Product Description</p>
          <textarea 
            onChange={(e) => setDescription(e.target.value)} 
            value={description} 
            className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]' 
            placeholder='Enter product description' 
            required 
          />
        </div>

        <div className='w-full mb-4'>
          <p className='mb-2'>Product Price ($)</p>
          <input 
            onChange={(e) => setPrice(e.target.value)} 
            value={price} 
            className='w-full max-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500' 
            type="number" 
            placeholder="Enter price" 
            required 
          />
        </div>
      </div>
      
      {/* Product Tags Section */}
      <div className='w-full bg-white rounded-lg shadow-md p-6 mb-5'>
        <p className='mb-4 text-lg font-semibold'>Product Categories (Tags)</p>
        <p className='text-gray-500 mb-3'>Tags are used to categorize and filter products. Add at least one tag.</p>
        
        <div className='flex mb-3'>
          <input 
            value={tagInput} 
            onChange={(e) => setTagInput(e.target.value)} 
            onKeyPress={handleTagKeyPress}
            className='flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500' 
            type="text" 
            placeholder='Enter custom tag'
          />
          <button 
            type="button" 
            onClick={addTag} 
            className='px-4 py-2 bg-black text-white rounded-r-lg hover:bg-gray-800'
          >
            Add
          </button>
        </div>
        
        <div className='mb-4'>
          <p className='mb-2'>Suggested Tags:</p>
          <div className='flex flex-wrap gap-2'>
            {suggestedTags.map((tag, index) => (
              <button
                key={index}
                type="button"
                onClick={() => addSuggestedTag(tag)}
                className={`px-3 py-1 text-sm rounded-full ${tags.includes(tag) ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
        
        {tags.length > 0 && (
          <div>
            <p className='mb-2'>Selected Tags:</p>
            <div className='flex flex-wrap gap-2 mt-2'>
              {tags.map((tag, index) => (
                <div key={index} className='flex items-center bg-blue-100 px-3 py-1 rounded-full'>
                  <span className='text-blue-800'>{tag}</span>
                  <button 
                    type="button" 
                    onClick={() => removeTag(index)} 
                    className='ml-2 text-blue-800 hover:text-blue-600'
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Product Variants Section */}
      <div className='w-full bg-white rounded-lg shadow-md p-6 mb-5'>
        <div className='flex items-center justify-between mb-4'>
          <p className='text-lg font-semibold'>Product Variants</p>
          <button 
            type="button" 
            onClick={addVariant} 
            className='px-3 py-1 bg-black text-white rounded-lg hover:bg-gray-800 text-sm'
          >
            Add Variant
          </button>
        </div>
        
        {variants.map((variant, variantIndex) => (
          <div key={variantIndex} className='mb-5 p-4 border border-gray-200 rounded-lg bg-gray-50'>
            <div className='flex justify-between items-center mb-3'>
              <div className='flex-1 mr-2'>
                <p className='text-sm mb-1'>Variant Name (e.g. "Size", "Color")</p>
                <input 
                  value={variant.name} 
                  onChange={(e) => handleVariantNameChange(variantIndex, e.target.value)} 
                  className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500' 
                  type="text" 
                  placeholder='Enter variant name'
                  required
                />
              </div>
              
              {variants.length > 1 && (
                <button 
                  type="button" 
                  onClick={() => removeVariant(variantIndex)} 
                  className='ml-2 px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm'
                >
                  Remove
                </button>
              )}
            </div>
            
            <div className='mt-3'>
              <p className='text-sm mb-1'>Variant Options (e.g. "S", "M", "L" or "Red", "Blue")</p>
              <div className='flex'>
                <input 
                  value={optionInput} 
                  onChange={(e) => setOptionInput(e.target.value)} 
                  className='flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500' 
                  type="text" 
                  placeholder='Enter option value'
                />
                <button 
                  type="button" 
                  onClick={() => addVariantOption(variantIndex)} 
                  className='px-4 py-2 bg-black text-white rounded-r-lg hover:bg-gray-800'
                >
                  Add
                </button>
              </div>
              
              <div className='flex flex-wrap gap-2 mt-3'>
                {variant.options.map((option, optionIndex) => (
                  <div key={optionIndex} className='flex items-center bg-gray-200 px-3 py-1 rounded-full'>
                    <span>{option}</span>
                    <button 
                      type="button" 
                      onClick={() => removeVariantOption(variantIndex, optionIndex)} 
                      className='ml-2 text-gray-600 hover:text-gray-800'
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

      {/* Inventory Management */}
      {generateVariantCombinations().length > 0 && (
        <div className='w-full bg-white rounded-lg shadow-md p-6 mb-5'>
          <p className='mb-4 text-lg font-semibold'>Inventory Management</p>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {generateVariantCombinations().map((combination, index) => {
              const key = getInventoryKey(combination);
              return (
                <div key={index} className='flex items-center gap-3 p-3 border border-gray-200 rounded-lg'>
                  <span className='font-medium'>{combination.join(' / ')}:</span>
                  <input
                    type="number"
                    min="0"
                    value={inventory[key] || ''}
                    onChange={(e) => handleInventoryChange(key, e.target.value)}
                    className='w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
                    placeholder="Qty"
                    required
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className='w-full bg-white rounded-lg shadow-md p-6 mb-5'>
        <div className='flex items-center gap-2'>
          <input 
            onChange={() => setBestSeller(prev => !prev)} 
            checked={bestSeller} 
            type="checkbox" 
            id='bestSeller' 
            className='w-4 h-4'
          />
          <label className='cursor-pointer' htmlFor="bestSeller">Mark as Featured Product</label>
        </div>
      </div>

      <button 
        type="submit" 
        className='px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors'
      >
        Add Product
      </button>
    </form>
  )
}

export default Add