import { useContext, useEffect, useRef } from 'react';
import { motion, useAnimation, useInView } from 'framer-motion';

import { ShopContext } from '../context/shopContext';
import { FiCpu, FiTarget, FiAward, FiShield, FiTrendingUp, FiPackage, FiHeadphones, FiHardDrive, FiMonitor, FiSmartphone, FiServer } from 'react-icons/fi';
import Seo from '../components/Seo';

const About = () => {
  const { navigate } = useContext(ShopContext);

  // Animation variants
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.6,
        ease: "easeOut"
      } 
    }
  };
  
  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };
  
  const scaleIn = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        duration: 0.5,
        ease: "easeOut"
      } 
    }
  };

  // For the floating icons animation
  const iconContainerRef = useRef(null);
  const isInView = useInView(iconContainerRef, { once: false, amount: 0.3 });
  const controls = useAnimation();

  useEffect(() => {
    if (isInView) {
      controls.start("visible");
    }
  }, [controls, isInView]);

  const floatingIcons = [
    { icon: <FiCpu />, x: -20, y: -15, delay: 0 },
    { icon: <FiMonitor />, x: 25, y: 20, delay: 0.5 },
    { icon: <FiSmartphone />, x: -25, y: 15, delay: 1 },
    { icon: <FiHardDrive />, x: 15, y: -20, delay: 1.5 },
    { icon: <FiServer />, x: 5, y: 25, delay: 2 }
  ];

  return (

      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 pt-[80px] md:pt-[100px]">

        <Seo title="About" description="Who Netronix is, and what the shop sells." />
      {/* Hero Section */}
      <motion.div 
        className="relative overflow-hidden bg-[#6a5acd] text-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        <div className="absolute inset-0 opacity-20">
          {/* Tech-inspired background elements */}
          <div className="absolute inset-y-0 left-1/2 w-full bg-white opacity-10 transform -skew-x-12"></div>
          <div className="absolute inset-y-0 right-1/4 w-24 bg-white opacity-10 transform -skew-x-12"></div>
          <div className="absolute top-0 left-0 w-full h-full">
            <div className="absolute top-1/4 left-1/4 w-1 h-20 bg-white opacity-30 rounded-full"></div>
            <div className="absolute top-1/3 left-1/3 w-2 h-2 bg-white opacity-30 rounded-full"></div>
            <div className="absolute top-2/3 left-2/3 w-3 h-3 bg-white opacity-20 rounded-full"></div>
            <div className="absolute top-1/2 left-3/4 w-12 h-1 bg-white opacity-20 rounded-full"></div>
            <div className="absolute bottom-1/4 right-1/4 w-1 h-16 bg-white opacity-30 rounded-full"></div>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#6a5acd] to-transparent"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 md:py-32 flex flex-col items-center">
          <motion.div
            ref={iconContainerRef}
            className="absolute inset-0 pointer-events-none"
          >
            {floatingIcons.map((item, index) => (
              <motion.div
                key={index}
                className="absolute text-white opacity-30 text-4xl"
                style={{ 
                  top: `${50 + item.y}%`, 
                  left: `${50 + item.x}%`,
                  x: "-50%",
                  y: "-50%"
                }}
                initial={{ opacity: 0 }}
                animate={controls}
                variants={{
                  visible: {
                    opacity: 0.6,
                    y: [item.y, item.y - 10, item.y],
                    transition: {
                      opacity: { duration: 0.5, delay: item.delay },
                      y: { 
                        repeat: Infinity, 
                        repeatType: "reverse", 
                        duration: 2,
                        ease: "easeInOut",
                        delay: item.delay
                      }
                    }
                  }
                }}
              >
                {item.icon}
              </motion.div>
            ))}
          </motion.div>
          
          <motion.h1 
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-center mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            Powering Your Digital Future
            <span className="block mt-3">with Cutting-Edge Tech</span>
          </motion.h1>
          
          <motion.p 
            className="text-lg md:text-xl text-center max-w-3xl mb-10 opacity-90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            At Netronix, we bring you the best in computers, components, and tech accessories to power your digital lifestyle.
          </motion.p>
        </div>
      </motion.div>
      
      {/* Our Story Section */}
      <motion.div 
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={fadeIn}
      >
        <div className="flex flex-col md:flex-row gap-12 lg:gap-20 items-center">
          <motion.div 
            className="md:w-1/2 relative"
            variants={scaleIn}
          >
            <div className="relative rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-[#6a5acd]/10 to-white p-8">
              <div className="grid grid-cols-2 gap-6">
                {/* Tech product illustrations */}
                <motion.div 
                  className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-center"
                  whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(106, 90, 205, 0.1)" }}
                >
                  <FiMonitor className="w-16 h-16 text-[#6a5acd]" />
                </motion.div>
                <motion.div 
                  className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-center"
                  whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(106, 90, 205, 0.1)" }}
                >
                  <FiCpu className="w-16 h-16 text-[#6a5acd]" />
                </motion.div>
                <motion.div 
                  className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-center"
                  whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(106, 90, 205, 0.1)" }}
                >
                  <FiSmartphone className="w-16 h-16 text-[#6a5acd]" />
                </motion.div>
                <motion.div 
                  className="bg-white rounded-xl shadow-sm p-6 flex items-center justify-center"
                  whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(106, 90, 205, 0.1)" }}
                >
                  <FiHardDrive className="w-16 h-16 text-[#6a5acd]" />
                </motion.div>
              </div>
              <div className="mt-8 bg-white rounded-xl shadow-sm p-6 flex items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <h3 className="text-2xl font-bold text-[#6a5acd] text-center">Netronix</h3>
                  <p className="text-gray-600 text-center mt-2">Your Tech Partner Since 2025</p>
                </motion.div>
              </div>
            </div>
            <motion.div 
              className="absolute -bottom-6 -right-6 md:-bottom-10 md:-right-10 w-32 h-32 md:w-48 md:h-48 bg-[#6a5acd]/10 rounded-full z-[-1]"
              animate={{
                scale: [1, 1.05, 1],
                rotate: [0, 5, 0],
              }}
              transition={{
                duration: 8,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            />
            
            <motion.div
              className="absolute -top-4 -left-4 w-16 h-16 md:w-24 md:h-24 border-2 border-[#6a5acd]/20 rounded-xl z-[-1]"
              animate={{
                rotate: [0, 90],
                opacity: [0.5, 0.3, 0.5]
              }}
              transition={{
                duration: 12,
                ease: "linear",
                repeat: Infinity
              }}
            />
          </motion.div>
          
          <motion.div 
            className="md:w-1/2"
            variants={fadeIn}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">Our Story</h2>
            
            <div className="space-y-6 text-gray-600">
              <p className="text-lg">
                Netronix was founded in 2025 with a clear vision: to provide high-quality technology products with exceptional service. What began as a small computer repair shop has evolved into a premier destination for tech enthusiasts and professionals alike.
              </p>
              
              <p className="text-lg">
                Our journey has been driven by a passion for technology and a commitment to staying at the forefront of digital innovation. We carefully curate our product selection, partnering with leading manufacturers to bring you the latest advancements in computing technology.
              </p>
              
              <div className="pt-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-4">
                  <FiTarget className="text-[#6a5acd]" />
                  Our Mission
                </h3>
                <p className="text-lg pl-7">
                  Our mission is to empower individuals and businesses with technology solutions that enhance productivity, creativity, and connectivity. We believe that access to quality tech should be straightforward and supported by expertise you can trust.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
      
      {/* Product Categories Section */}
      <motion.div 
        className="bg-gray-50 py-20 overflow-hidden"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={fadeIn}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div 
            className="text-center mb-16 relative z-10"
            variants={fadeIn}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">What We Offer</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Discover our comprehensive range of tech products and solutions
            </p>
          </motion.div>
          
          <motion.div 
            className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 relative z-10"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {[
              { icon: <FiMonitor className="w-8 h-8" />, title: "Computers & Laptops", delay: 0 },
              { icon: <FiCpu className="w-8 h-8" />, title: "Components & Parts", delay: 0.1 },
              { icon: <FiSmartphone className="w-8 h-8" />, title: "Mobile Devices", delay: 0.2 },
              { icon: <FiHardDrive className="w-8 h-8" />, title: "Storage Solutions", delay: 0.3 },
              { icon: <FiServer className="w-8 h-8" />, title: "Networking", delay: 0.4 },
              { icon: <FiHeadphones className="w-8 h-8" />, title: "Accessories", delay: 0.5 },
              { icon: <FiTarget className="w-8 h-8" />, title: "Gaming", delay: 0.6 },
              { icon: <FiShield className="w-8 h-8" />, title: "Software & Security", delay: 0.7 }
            ].map((item, index) => (
              <motion.div 
                key={index}
                className="bg-white rounded-xl p-6 hover:shadow-md transition-all text-center group hover:bg-[#6a5acd]/5 hover:border-[#6a5acd]/30 border border-transparent"
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { 
                    opacity: 1, 
                    y: 0,
                    transition: { delay: item.delay, duration: 0.5 }
                  }
                }}
                whileHover={{ y: -5 }}
              >
                <motion.div 
                  className="w-16 h-16 bg-[#6a5acd]/10 text-[#6a5acd] rounded-lg flex items-center justify-center mx-auto mb-4"
                  whileHover={{ 
                    scale: 1.1,
                    rotate: 5,
                    backgroundColor: "rgba(106, 90, 205, 0.2)"
                  }}
                >
                  {item.icon}
                </motion.div>
                <h3 className="font-semibold text-lg text-gray-900">{item.title}</h3>
              </motion.div>
            ))}
          </motion.div>
          
          {/* Animated background elements */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              className="absolute top-10 left-10 w-32 h-32 rounded-full border border-[#6a5acd]/10"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.1, 0.3],
                x: [0, 30, 0],
                y: [0, 30, 0]
              }}
              transition={{
                duration: 15,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className="absolute bottom-20 right-20 w-48 h-48 rounded-full border border-[#6a5acd]/10"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.2, 0.05, 0.2],
                x: [0, -40, 0],
                y: [0, -30, 0]
              }}
              transition={{
                duration: 18,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
        </div>
      </motion.div>
      
      {/* Values Section */}
      <motion.div 
        className="py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={fadeIn}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            variants={fadeIn}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our Core Values</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Everything we do is guided by these principles that define who we are
            </p>
          </motion.div>
          
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={staggerContainer}
          >
            <motion.div 
              className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-all"
              variants={scaleIn}
              whileHover={{ y: -5 }}
            >
              <motion.div 
                className="w-14 h-14 bg-[#6a5acd]/10 text-[#6a5acd] rounded-xl flex items-center justify-center mb-6"
                whileHover={{ rotate: 10 }}
              >
                <FiShield className="w-7 h-7" />
              </motion.div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Quality Assurance</h3>
              <p className="text-gray-600">
                We source products from trusted manufacturers and provide comprehensive warranties. Every product undergoes rigorous testing before reaching our customers.
              </p>
            </motion.div>
            
            <motion.div 
              className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-all"
              variants={scaleIn}
              whileHover={{ y: -5 }}
            >
              <motion.div 
                className="w-14 h-14 bg-[#6a5acd]/10 text-[#6a5acd] rounded-xl flex items-center justify-center mb-6"
                whileHover={{ rotate: 10 }}
              >
                <FiTrendingUp className="w-7 h-7" />
              </motion.div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Innovation Focus</h3>
              <p className="text-gray-600">
                We constantly update our inventory with the latest tech, staying ahead of trends to bring you cutting-edge solutions that enhance your digital experience.
              </p>
            </motion.div>
            
            <motion.div 
              className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-all"
              variants={scaleIn}
              whileHover={{ y: -5 }}
            >
              <motion.div 
                className="w-14 h-14 bg-[#6a5acd]/10 text-[#6a5acd] rounded-xl flex items-center justify-center mb-6"
                whileHover={{ rotate: 10 }}
              >
                <FiHeadphones className="w-7 h-7" />
              </motion.div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Expert Support</h3>
              <p className="text-gray-600">
                Our team of tech enthusiasts and certified professionals provides knowledgeable advice to help you make informed purchasing decisions.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
      
      {/* Why Choose Us Section */}
      <motion.div 
        className="bg-gray-50 py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={fadeIn}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            variants={fadeIn}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Why Choose Netronix</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Our commitment to excellence sets us apart
            </p>
          </motion.div>
          
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={staggerContainer}
          >
            <motion.div 
              className="border border-gray-200 hover:border-[#6a5acd]/30 p-8 rounded-xl hover:bg-[#6a5acd]/5 transition-all duration-300"
              variants={fadeIn}
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-4 mb-6">
                <FiAward className="w-8 h-8 text-[#6a5acd]" />
                <h3 className="text-xl font-bold text-gray-900">Curated Selection</h3>
              </div>
              <p className="text-gray-600">
                We carefully select each product in our inventory, focusing on performance, reliability, and value. Our tech experts test and verify everything we sell.
              </p>
            </motion.div>
            
            <motion.div 
              className="border border-gray-200 hover:border-[#6a5acd]/30 p-8 rounded-xl hover:bg-[#6a5acd]/5 transition-all duration-300"
              variants={fadeIn}
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-4 mb-6">
                <FiPackage className="w-8 h-8 text-[#6a5acd]" />
                <h3 className="text-xl font-bold text-gray-900">Swift Delivery</h3>
              </div>
              <p className="text-gray-600">
                Get your tech quickly with our optimized logistics network. We offer same-day shipping on most in-stock items and provide detailed tracking information.
              </p>
            </motion.div>
            
            <motion.div 
              className="border border-gray-200 hover:border-[#6a5acd]/30 p-8 rounded-xl hover:bg-[#6a5acd]/5 transition-all duration-300"
              variants={fadeIn}
              whileHover={{ scale: 1.02 }}
            >
              <div className="flex items-center gap-4 mb-6">
                <FiHeadphones className="w-8 h-8 text-[#6a5acd]" />
                <h3 className="text-xl font-bold text-gray-900">Tech Support</h3>
              </div>
              <p className="text-gray-600">
                Our customer support goes beyond sales. We offer setup assistance, troubleshooting help, and ongoing technical support to ensure your technology works for you.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
      
      {/* CTA Section */}
      <motion.div 
        className="bg-[#6a5acd] text-white overflow-hidden relative"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        variants={fadeIn}
      >
        <div className="absolute inset-0 opacity-10">
          <motion.div 
            className="absolute top-0 left-0 right-0 bottom-0"
            animate={{ 
              backgroundPosition: ["0% 0%", "100% 100%"]
            }}
            transition={{ 
              duration: 20, 
              ease: "linear", 
              repeat: Infinity,
              repeatType: "reverse"
            }}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 relative">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to upgrade your tech?</h2>
              <p className="text-lg opacity-90 mb-6 md:mb-0 max-w-xl">
                Browse our extensive collection of computers, components, and accessories to find the perfect tech for your needs.
              </p>
            </div>
            <motion.div 
              className="flex-shrink-0"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <button 
                /* FE-031 — router navigation. `window.location.href` discarded
                   the whole application and reloaded it from the network to move
                   between two routes the router already owns. */
                onClick={() => navigate('/collections/all')}
                className="fill-button px-8 py-4 bg-white text-[#6a5acd] rounded-lg font-medium hover:bg-gray-100 transition-colors shadow-lg"
              >
                Shop Now
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default About;