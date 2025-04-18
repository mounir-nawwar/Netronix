import React, { useState } from 'react';
import axios from 'axios';
import { backendUrl } from '../App';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { IoMailOutline, IoLockClosedOutline, IoArrowForwardOutline } from "react-icons/io5";

const Login = ({ setToken }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await axios.post(backendUrl + '/api/user/admin', { email, password });
      if (response.data.success) {
        setToken(response.data.token);
        toast.success('Welcome to admin panel!');
      } else {
        toast.error(response.data.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 24
      }
    }
  };

  const buttonVariants = {
    hover: { 
      scale: 1.05, 
      boxShadow: "0px 5px 15px rgba(0, 0, 0, 0.1)",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 10
      }
    },
    tap: { 
      scale: 0.95 
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-white to-gray-50">
      <motion.div 
        className="w-full max-w-md bg-white shadow-xl rounded-3xl overflow-hidden border border-gray-100"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="relative">
          {/* Background pattern */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-r from-[#f9f9f9] to-[#f3f3f3] rounded-b-[30%]"></div>
          
          {/* Form header */}
          <motion.div 
            className="relative pt-12 pb-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.h1 
              className="text-3xl font-bold text-gray-900 mb-2"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Admin Panel
            </motion.h1>
            <motion.p 
              className="text-gray-600 text-sm"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Sign in to manage your store
            </motion.p>
          </motion.div>
        </div>

        {/* Form */}
        <motion.form 
          onSubmit={onSubmitHandler}
          className="px-8 pt-6 pb-8 bg-white"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Email field */}
          <motion.div className="mb-6" variants={itemVariants}>
            <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="email">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <IoMailOutline className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="email"
                type="email"
                className="appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 pl-10 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                placeholder="admin@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </motion.div>

          {/* Password field */}
          <motion.div className="mb-6" variants={itemVariants}>
            <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <IoLockClosedOutline className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="password"
                type="password"
                className="appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 pl-10 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </motion.div>

          {/* Submit button */}
          <motion.div variants={itemVariants}>
            <motion.button
              className={`w-full bg-black hover:bg-gray-900 text-white font-medium py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-all duration-200 flex items-center justify-center ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              type="submit"
              disabled={isLoading}
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
            >
              {isLoading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
              ) : null}
              Sign In to Admin
              <IoArrowForwardOutline className="ml-2 h-5 w-5" />
            </motion.button>
          </motion.div>
        </motion.form>

        {/* Footer */}
        <motion.div 
          className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-sm text-gray-600">
            Admin access only. Contact administrator for access.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;