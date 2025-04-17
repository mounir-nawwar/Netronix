import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { assets } from '../assets/assets'
import { FiHome, FiPackage, FiGrid, FiShoppingBag, FiUsers, FiSettings, FiLogOut, FiPlus } from 'react-icons/fi'

const Sidebar = () => {
  const navigate = useNavigate();
  
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };

  return (
    <div className='w-[250px] min-h-screen bg-white shadow-sm fixed left-0 top-0 z-10'>
      <div className='flex flex-col h-full'>
        {/* Logo area */}
        <div className='py-6 px-5 border-b border-gray-100'>
        <img
          src="https://cdn.prod.website-files.com/67ccd759c5839fca18ed2c8f/67ccde31189939f4c5cd0722_Netronix%20Logo%20black.png"
          alt="Netronix Logo"
          className="w-[140px] sm:w-[180px] md:w-[200px]"
        />
        </div>
        
        {/* Navigation links */}
        <div className='flex-1 py-8 px-3'>
          <p className='text-xs font-medium text-gray-400 px-3 mb-4 uppercase'>Main</p>
          
          <NavLink 
            className={({isActive}) => 
              `flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all ${
                isActive 
                  ? 'bg-[#f5f3ff] text-[#6a5acd] font-medium' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            } 
            to={"/"}
          >
            <FiHome className='w-5 h-5' />
            <p>Dashboard</p>
          </NavLink>

          <NavLink 
            className={({isActive}) => 
              `flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all ${
                isActive 
                  ? 'bg-[#f5f3ff] text-[#6a5acd] font-medium' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            } 
            to={"/add"}
          >
            <FiPlus className='w-5 h-5' />
            <p>Add Product</p>
          </NavLink>

          <NavLink 
            className={({isActive}) => 
              `flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all ${
                isActive 
                  ? 'bg-[#f5f3ff] text-[#6a5acd] font-medium' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            } 
            to={"/list"}
          >
            <FiGrid className='w-5 h-5' />
            <p>Products</p>
          </NavLink>

          <NavLink 
            className={({isActive}) => 
              `flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all ${
                isActive 
                  ? 'bg-[#f5f3ff] text-[#6a5acd] font-medium' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            } 
            to={"/orders"}
          >
            <FiShoppingBag className='w-5 h-5' />
            <p>Orders</p>
          </NavLink>
          
          {/* Additional navigation sections */}
          <p className='text-xs font-medium text-gray-400 px-3 mt-8 mb-4 uppercase'>Account</p>
          
          <NavLink 
            className={({isActive}) => 
              `flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all ${
                isActive 
                  ? 'bg-[#f5f3ff] text-[#6a5acd] font-medium' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            } 
            to={"/users"}
          >
            <FiUsers className='w-5 h-5' />
            <p>Users</p>
          </NavLink>
          
          <NavLink 
            className={({isActive}) => 
              `flex items-center gap-3 px-4 py-3 mb-2 rounded-lg transition-all ${
                isActive 
                  ? 'bg-[#f5f3ff] text-[#6a5acd] font-medium' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`
            } 
            to={"/settings"}
          >
            <FiSettings className='w-5 h-5' />
            <p>Settings</p>
          </NavLink>
        </div>
        
        {/* Logout button */}
        <div className='px-3 py-4 border-t border-gray-100'>
          <button 
            onClick={handleLogout}
            className='flex items-center gap-3 px-4 py-3 w-full text-left rounded-lg text-gray-600 hover:bg-gray-50 transition-all'
          >
            <FiLogOut className='w-5 h-5' />
            <p>Logout</p>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Sidebar