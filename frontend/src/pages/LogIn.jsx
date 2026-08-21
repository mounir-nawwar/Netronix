import { useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from '../lib/toast';

import { ShopContext } from '../context/shopContext';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import { motion } from 'framer-motion';
import { IoMailOutline, IoLockClosedOutline, IoPersonOutline, IoArrowForwardOutline } from "react-icons/io5";
import Seo from '../components/Seo';

const LogIn = () => {
  const [currentState, setCurrentState] = useState('Login');
  // FE-009 — signing in goes through `applySession`, which merges whatever this
  // browser had in its guest cart before it hands over. The old path set the
  // token and let an effect call `getUserCart`, which replaced local state
  // wholesale: everything chosen before signing in was discarded at exactly the
  // moment the customer committed to the site, with no message.
  const { token, applySession, navigate } = useContext(ShopContext);
  const location = useLocation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    
    try {
      const nextToken = currentState === 'Sign Up'
        ? await authApi.register({ name, email, password })
        : await authApi.login({ email, password });

      if (!nextToken) {
        toast.error('We could not sign you in. Please try again.');
        return;
      }

      if (currentState === 'Sign Up') toast.success('Sign up successful! Welcome aboard!');
      await applySession(nextToken);
    } catch (error) {
      // The server's own message, not "Request failed with status code 401".
      toast.error(error instanceof ApiError ? error.message : 'We could not sign you in.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Back to wherever the guard sent them from, or home (FE-021).
    if (token) navigate(location.state?.from ?? '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
  
  const switchButtonVariants = {
    hover: { 
      color: "#000", 
      transition: { duration: 0.3 } 
    }
  };

  return (

      <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 bg-gradient-to-b from-white to-gray-50">

        <Seo title="Sign in" description="Sign in to your Netronix account, or create one." />
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
              {currentState === 'Login' ? 'Welcome Back' : 'Create Account'}
            </motion.h1>
            <motion.p 
              className="text-gray-600 text-sm"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {currentState === 'Login' 
                ? 'Sign in to continue to your account' 
                : 'Sign up to get started with Netronix'}
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
          {/* Name field (only for Sign Up) */}
          {currentState === 'Sign Up' && (
            <motion.div className="mb-6" variants={itemVariants}>
              <label className="block text-gray-700 text-sm font-medium mb-2" htmlFor="name">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <IoPersonOutline className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="name"
                  type="text"
                  className="appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 pl-10 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="John Doe"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </motion.div>
          )}

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
                placeholder="you@example.com"
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

          {/* Form actions */}
          <motion.div className="flex items-center justify-between mb-6" variants={itemVariants}>
            {currentState === 'Login' ? (
              <motion.a
                className="inline-block align-baseline text-sm text-indigo-600 hover:text-indigo-800 cursor-pointer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Forgot Password?
              </motion.a>
            ) : (
              <div className="w-full text-center text-xs text-gray-500">
                By signing up, you agree to our <span className="text-indigo-600 cursor-pointer">Terms</span> and <span className="text-indigo-600 cursor-pointer">Privacy Policy</span>
              </div>
            )}
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
              {currentState === 'Login' ? 'Sign In' : 'Create Account'}
              <IoArrowForwardOutline className="ml-2 h-5 w-5" />
            </motion.button>
          </motion.div>
        </motion.form>

        {/* Switch between login and signup */}
        <motion.div 
          className="px-8 py-4 bg-gray-50 border-t border-gray-100 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-sm text-gray-600">
            {currentState === 'Login' ? "Don't have an account?" : "Already have an account?"}
            <motion.button
              className="ml-1 font-medium text-indigo-600"
              onClick={() => setCurrentState(currentState === 'Login' ? 'Sign Up' : 'Login')}
              variants={switchButtonVariants}
              whileHover="hover"
            >
              {currentState === 'Login' ? 'Sign Up' : 'Sign In'}
            </motion.button>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default LogIn;