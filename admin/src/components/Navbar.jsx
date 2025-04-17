import React from 'react'
import { assets } from '../assets/assets'
import { FiLogOut, FiUser, FiBell, FiSearch } from 'react-icons/fi'

const Navbar = ({ setToken }) => {
  return (
    <div className='fixed top-0 left-[250px] right-0 z-10 flex items-center h-16 px-6 justify-between bg-white shadow-sm border-b border-gray-100'>
      {/* Search bar */}
      <div className="flex items-center w-1/3">
        <div className="relative w-full">
          <input 
            type="text" 
            placeholder="Search..." 
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent"
          />
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-full text-gray-600 hover:bg-gray-100 relative">
          <FiBell className="w-5 h-5" />
          <span className="absolute top-0 right-0 h-4 w-4 bg-[#6a5acd] rounded-full text-white text-[10px] flex items-center justify-center">2</span>
        </button>
        
        <div className="flex items-center gap-2 bg-[#f5f3ff] py-1.5 px-3 rounded-md">
          <FiUser className="text-[#6a5acd]" />
          <span className="text-sm text-gray-700">Admin</span>
        </div>
        
        <button
          onClick={() => setToken('')}
          className='flex items-center gap-1.5 bg-white border border-[#6a5acd] text-[#6a5acd] hover:bg-[#6a5acd] hover:text-white transition-colors px-4 py-1.5 rounded-md text-sm'
        >
          <FiLogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}

export default Navbar