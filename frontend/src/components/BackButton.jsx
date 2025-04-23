import React, { useContext } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { ShopContext } from '../context/ShopContext';
import { motion } from 'framer-motion';

const BackButton = ({ className = '', showLabel = true }) => {
  const { navigate } = useContext(ShopContext);

  const handleBackNavigation = () => {
    // Use the browser's native back functionality
    window.history.back();
  };

  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-center gap-2 text-gray-600 hover:text-[#6a5acd] transition-colors ${className}`}
      onClick={handleBackNavigation}
      aria-label="Go back"
    >
      <FiArrowLeft className="w-4 h-4" />
      {showLabel && <span className="text-sm">Back</span>}
    </motion.button>
  );
};

export default BackButton; 