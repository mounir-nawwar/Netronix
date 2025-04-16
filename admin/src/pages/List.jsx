import React, { useEffect, useState } from 'react';
import { backendUrl } from '../App';
import axios from 'axios';
import { toast } from 'react-toastify';

const List = ({ token }) => {
  const [list, setList] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [inventoryEdit, setInventoryEdit] = useState({});

  const fetchList = async () => {
    try {
      const response = await axios.get(backendUrl + '/api/product/list');
      console.log("API Response:", response.data);

      if (response.data.success) {
        console.log("Products Array:", response.data.products);
        setList(response.data.products);
        console.log("list:",list);
        
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      console.log("Fetch Error:", error);
      toast.error(error.message);
    }
  };


  const removeProduct = async (id) => {
    try {
      const response = await axios.post(
        backendUrl + '/api/product/remove',
        { id },
        { headers: { token } }
      );
      console.log("Remove API Response:", response.data);

      if (response.data.success) {
        toast.success(response.data.message);
        fetchList(); // Refresh list after removing product
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      console.log("Remove Error:", error);
      toast.error(error.message);
    }
  };

  const openInventoryModal = (product) => {
    setSelectedProduct(product);
    setInventoryEdit(product.inventory || {});
  };

  const closeInventoryModal = () => {
    setSelectedProduct(null);
    setInventoryEdit({});
  };

  const handleInventoryChange = (variantKey, value) => {
    setInventoryEdit(prev => ({
      ...prev,
      [variantKey]: parseInt(value) || 0
    }));
  };

  const updateInventory = async () => {
    try {
      // Update inventory for each variant combination
      const updatePromises = Object.keys(inventoryEdit).map(variantKey => 
        axios.post(
          backendUrl + '/api/product/update-inventory',
          {
            productId: selectedProduct._id,
            variantKey,
            quantity: inventoryEdit[variantKey] || 0
          },
          { headers: { token } }
        )
      );
      
      await Promise.all(updatePromises);
      
      toast.success('Inventory updated successfully');
      closeInventoryModal();
      fetchList(); // Refresh list after updating inventory
    } catch (error) {
      console.log("Update Inventory Error:", error);
      toast.error(error.message);
    }
  };

  // Format variant key for display
  const formatVariantKey = (product, variantKey) => {
    if (!product || !product.variants || !variantKey) return variantKey;
    
    try {
      const variantOptions = variantKey.split('-');
      if (product.variants.length !== variantOptions.length) return variantKey;
      
      return product.variants.map((variant, index) => 
        `${variant.name}: ${variantOptions[index]}`
      ).join(', ');
    } catch (e) {
      return variantKey;
    }
  };

  useEffect(() => {
    console.log("useEffect ran, fetching list...");
    fetchList();
  }, []);

  useEffect(() => {
    console.log("Updated list state:", list);
  }, [list]);

  return (
    <div className="font-michroma">
      <h1 className="text-2xl font-bold mb-5">Products</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-semibold">All Products</h2>
          <button 
            onClick={fetchList}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"
          >
            Refresh
          </button>
        </div>
        
        <div className='flex flex-col gap-2'>
          {/* List Table Title */}
          <div className='hidden md:grid grid-cols-[1fr_3fr_2fr_1fr_1fr_1fr] items-center py-3 px-4 bg-gray-100 text-sm font-medium rounded-t-lg'>
            <span>Image</span>
            <span>Name</span>
            <span>Tags</span>
            <span>Price</span>
            <span>Inventory</span>
            <span className='text-center'>Actions</span>
          </div>

          {/* Product List */}
          {list.length > 0 ? (
            list.map((item, index) => (
              <div key={index} className='grid grid-cols-1 md:grid-cols-[1fr_3fr_2fr_1fr_1fr_1fr] items-center gap-4 py-4 px-4 border-b hover:bg-gray-50'>
                <div>
                  <img className='w-16 h-16 object-cover rounded-md' src={item.image[0]} alt={item.name} />
                </div>
                
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-500 truncate">{item.description}</p>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {item.tags && item.tags.map((tag, tagIndex) => (
                    <span key={tagIndex} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
                
                <div>
                  <p className="font-medium">${item.price}</p>
                </div>
                
                <div>
                  <button 
                    onClick={() => openInventoryModal(item)} 
                    className="bg-black text-white px-3 py-1 rounded-md text-xs hover:bg-gray-800"
                  >
                    Manage Stock
                  </button>
                </div>
                
                <div className="flex justify-center">
                  <button 
                    onClick={() => removeProduct(item._id)} 
                    className="bg-red-500 text-white px-3 py-1 rounded-md text-xs hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-gray-500">No products found</div>
          )}
        </div>
      </div>

      {/* Inventory Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Update Inventory for {selectedProduct.name}</h2>
            
            <div className="mb-4 max-h-[50vh] overflow-y-auto">
              {Object.keys(inventoryEdit).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.keys(inventoryEdit).map((variantKey, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="text-sm">
                        {formatVariantKey(selectedProduct, variantKey)}
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={inventoryEdit[variantKey] || 0}
                        onChange={(e) => handleInventoryChange(variantKey, e.target.value)}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500">No variants found for this product</p>
              )}
            </div>
            
            <div className="flex justify-end gap-3 mt-4">
              <button 
                onClick={closeInventoryModal}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
              <button 
                onClick={updateInventory}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
              >
                Update Inventory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default List;
