import React from 'react';
import { FiUsers, FiTool } from 'react-icons/fi';

const Users = () => {
  return (
    <div className="font-michroma">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Users (Under Development)</h1>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm p-12 text-center">
        <FiTool className="w-16 h-16 mx-auto text-[#6a5acd] mb-4" />
        <h2 className="text-xl font-medium text-gray-800 mb-2">This Page is Under Development</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          The user management features are currently being built.
          Check back soon for updates.
        </p>
      </div>
    </div>
  );
};

export default Users; 