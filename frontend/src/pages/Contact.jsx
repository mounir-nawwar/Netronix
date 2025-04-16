import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiMapPin, FiPhone, FiMail, FiClock, FiSend, FiCheckCircle, FiAlertCircle, FiUsers, FiCode, FiCpu, FiHardDrive, FiServer, FiMonitor, FiHeadphones } from 'react-icons/fi';

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // null, 'success', 'error'
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitStatus('success');
      
      // Reset form after showing success message
      setTimeout(() => {
        setSubmitStatus(null);
        setFormData({
          name: '',
          email: '',
          subject: '',
          message: ''
        });
      }, 3000);
    }, 1500);
  };
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  // Tech icons for animation
  const techIcons = [
    { icon: <FiCpu />, x: -25, y: -30, delay: 0.2, duration: 8 },
    { icon: <FiHardDrive />, x: 30, y: 10, delay: 0.5, duration: 10 },
    { icon: <FiServer />, x: -20, y: 40, delay: 0.8, duration: 9 },
    { icon: <FiMonitor />, x: 25, y: -15, delay: 0.3, duration: 7 },
    { icon: <FiHeadphones />, x: 5, y: 25, delay: 0.6, duration: 11 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 pt-[80px] md:pt-[100px]">
      {/* Hero Section */}
      <div className="bg-[#6a5acd] relative overflow-hidden">
        <div className="absolute inset-0 w-full h-full">
          {/* Tech pattern background */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-y-0 left-1/3 w-1/3 bg-white opacity-10 transform -skew-x-12"></div>
            <div className="absolute top-0 right-0 h-1/2 w-1/4 bg-white opacity-5 transform skew-y-12"></div>
            
            {/* Circuit board pattern */}
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0 opacity-5">
              <pattern id="circuit" width="100" height="100" patternUnits="userSpaceOnUse">
                <path d="M10 10 H90 V90 H10 Z" fill="none" stroke="white" strokeWidth="0.5"/>
                <circle cx="10" cy="10" r="2" fill="white"/>
                <circle cx="90" cy="10" r="2" fill="white"/>
                <circle cx="90" cy="90" r="2" fill="white"/>
                <circle cx="10" cy="90" r="2" fill="white"/>
                <circle cx="50" cy="50" r="5" fill="white"/>
                <path d="M10 50 H45 M55 50 H90 M50 10 V45 M50 55 V90" stroke="white" strokeWidth="0.5"/>
              </pattern>
              <rect width="100%" height="100%" fill="url(#circuit)"/>
            </svg>
          </div>
          
          {/* Floating tech icons */}
          {techIcons.map((item, index) => (
            <motion.div
              key={index}
              className="absolute text-white opacity-10 text-4xl"
              style={{ 
                left: `calc(50% + ${item.x}%)`, 
                top: `calc(50% + ${item.y}%)`,
                x: "-50%",
                y: "-50%"
              }}
              animate={{
                y: [item.y, item.y - 10, item.y],
                rotate: [0, 10, 0],
                opacity: [0.1, 0.2, 0.1]
              }}
              transition={{
                y: { 
                  repeat: Infinity, 
                  repeatType: "reverse", 
                  duration: item.duration / 2,
                  ease: "easeInOut",
                  delay: item.delay
                },
                rotate: {
                  repeat: Infinity,
                  repeatType: "reverse",
                  duration: item.duration,
                  ease: "easeInOut",
                  delay: item.delay
                },
                opacity: {
                  repeat: Infinity,
                  repeatType: "reverse",
                  duration: item.duration,
                  ease: "easeInOut",
                  delay: item.delay
                }
              }}
            >
              {item.icon}
            </motion.div>
          ))}
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 relative">
          <motion.div 
            className="text-center text-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Get in Touch</h1>
            <p className="text-lg md:text-xl opacity-90 max-w-3xl mx-auto">
              Have questions about our tech products or need IT assistance? Our team of experts is ready to help you find the perfect tech solution.
            </p>
          </motion.div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            {/* Left Column - Contact Info */}
            <motion.div 
              className="bg-[#6a5acd] text-white p-8 md:p-12 lg:w-2/5 relative overflow-hidden"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {/* Background circuit pattern */}
              <div className="absolute inset-0 opacity-10">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  <pattern id="circuitBoard" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M0 0 L25 0 L25 25 L50 25 L50 50 L25 50 L25 25 L0 25 Z" fill="none" stroke="white" strokeWidth="0.5"/>
                    <circle cx="0" cy="0" r="1" fill="white"/>
                    <circle cx="25" cy="25" r="1" fill="white"/>
                    <circle cx="50" cy="50" r="1" fill="white"/>
                  </pattern>
                  <rect width="100%" height="100%" fill="url(#circuitBoard)"/>
                </svg>
              </div>
              
              <div className="h-full flex flex-col relative">
                <h2 className="text-2xl font-bold mb-8">Contact Information</h2>
                
                <motion.div 
                  className="space-y-8 mb-12"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div className="flex items-start gap-4" variants={itemVariants}>
                    <div className="mt-1 bg-white/10 p-3 rounded-full">
                      <FiMapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg mb-1">Visit Our Store</h3>
                      <p className="opacity-80">Lebanese American University, Koraytem, Lebanons</p>
                    </div>
                  </motion.div>
                  
                  <motion.div className="flex items-start gap-4" variants={itemVariants}>
                    <div className="mt-1 bg-white/10 p-3 rounded-full">
                      <FiPhone className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg mb-1">Call Us</h3>
                      <p className="opacity-80">+961 81 995 653</p>
                      <p className="opacity-80">+961 81 995 653 (Tech Support)</p>
                    </div>
                  </motion.div>
                  
                  <motion.div className="flex items-start gap-4" variants={itemVariants}>
                    <div className="mt-1 bg-white/10 p-3 rounded-full">
                      <FiMail className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg mb-1">Email Us</h3>
                      <p className="opacity-80">info@netronix.tech</p>
                      <p className="opacity-80">support@netronix.tech</p>
                    </div>
                  </motion.div>
                  
                  <motion.div className="flex items-start gap-4" variants={itemVariants}>
                    <div className="mt-1 bg-white/10 p-3 rounded-full">
                      <FiClock className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg mb-1">Business Hours</h3>
                      <p className="opacity-80">Monday - Friday: 9AM - 8PM</p>
                      <p className="opacity-80">Saturday: 10AM - 6PM</p>
                    </div>
                  </motion.div>
                </motion.div>
                
                <div className="mt-auto">
                  <h3 className="font-medium text-lg mb-4">Connect With Us</h3>
                  <div className="flex gap-4">
                    <motion.a 
                      href="#" 
                      className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors"
                      whileHover={{ scale: 1.1, rotate: 10 }}
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                      </svg>
                    </motion.a>
                    <motion.a 
                      href="#" 
                      className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors"
                      whileHover={{ scale: 1.1, rotate: -10 }}
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                      </svg>
                    </motion.a>
                    <motion.a 
                      href="#" 
                      className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors"
                      whileHover={{ scale: 1.1, rotate: 10 }}
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                      </svg>
                    </motion.a>
                    <motion.a 
                      href="#" 
                      className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors"
                      whileHover={{ scale: 1.1, rotate: -10 }}
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                      </svg>
                    </motion.a>
                  </div>
                </div>
              </div>
            </motion.div>
            
            {/* Right Column - Contact Form */}
            <motion.div 
              className="p-8 md:p-12 lg:w-3/5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-8">Send a Message</h2>
              
              {submitStatus === 'success' ? (
                <motion.div 
                  className="bg-green-50 p-6 rounded-lg border border-green-100 flex items-start gap-4"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <FiCheckCircle className="text-green-500 w-6 h-6 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-green-800 text-lg">Message Sent!</h3>
                    <p className="text-green-700">Thank you for contacting Netronix. One of our tech experts will get back to you as soon as possible.</p>
                  </div>
                </motion.div>
              ) : submitStatus === 'error' ? (
                <motion.div 
                  className="bg-red-50 p-6 rounded-lg border border-red-100 flex items-start gap-4"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <FiAlertCircle className="text-red-500 w-6 h-6 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-red-800 text-lg">Message Failed to Send</h3>
                    <p className="text-red-700">There was an error sending your message. Please try again later or contact us directly.</p>
                  </div>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-colors"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-colors"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                      Subject
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-colors"
                    >
                      <option value="">Select a subject</option>
                      <option value="Sales Inquiry">Sales Inquiry</option>
                      <option value="Technical Support">Technical Support</option>
                      <option value="Product Information">Product Information</option>
                      <option value="Returns & Warranty">Returns & Warranty</option>
                      <option value="Partnership Opportunity">Partnership Opportunity</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  
                  <div className="mb-8">
                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                      Message
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={5}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent transition-colors"
                      placeholder="How can we help you with your tech needs?"
                    />
                  </div>
                  
                  <motion.button
                    type="submit"
                    className={`fill-button w-full md:w-auto px-8 py-4 bg-[#6a5acd] hover:bg-[#5d4ebd] text-white rounded-lg font-medium flex items-center justify-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                    disabled={isSubmitting}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <FiSend className="w-4 h-4" />
                        <span>Send Message</span>
                      </>
                    )}
                  </motion.button>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </div>
      
      {/* Tech Support Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <motion.div 
          className="bg-white rounded-xl shadow-lg overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="p-8 md:p-10 bg-[#6a5acd]/5">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Tech Support Center</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div 
                className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                whileHover={{ y: -5 }}
              >
                <div className="w-14 h-14 bg-[#6a5acd]/10 text-[#6a5acd] rounded-xl flex items-center justify-center mb-4">
                  <FiCode className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Technical Knowledge Base</h3>
                <p className="text-gray-600 mb-4">
                  Browse our extensive collection of tutorials, guides, and troubleshooting articles.
                </p>
                <a href="#" className="text-[#6a5acd] font-medium hover:text-[#5d4ebd] flex items-center gap-1">
                  Explore resources
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </motion.div>
              
              <motion.div 
                className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                whileHover={{ y: -5 }}
              >
                <div className="w-14 h-14 bg-[#6a5acd]/10 text-[#6a5acd] rounded-xl flex items-center justify-center mb-4">
                  <FiHeadphones className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Live Tech Support</h3>
                <p className="text-gray-600 mb-4">
                  Connect with our tech experts via live chat for immediate assistance with your devices.
                </p>
                <a href="#" className="text-[#6a5acd] font-medium hover:text-[#5d4ebd] flex items-center gap-1">
                  Start chat
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </motion.div>
              
              <motion.div 
                className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                whileHover={{ y: -5 }}
              >
                <div className="w-14 h-14 bg-[#6a5acd]/10 text-[#6a5acd] rounded-xl flex items-center justify-center mb-4">
                  <FiCpu className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Repair Services</h3>
                <p className="text-gray-600 mb-4">
                  Schedule a repair service for your computer, laptop, or other tech devices.
                </p>
                <a href="#" className="text-[#6a5acd] font-medium hover:text-[#5d4ebd] flex items-center gap-1">
                  Book service
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
      
      {/* Career Section */}
      <div className="bg-[#6a5acd]/5 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="bg-white rounded-xl shadow-lg overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5 }}
          >
            <div className="p-8 md:p-12 flex flex-col md:flex-row md:items-center gap-8">
              <div className="md:w-2/3">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Join Our Tech Team</h2>
                <p className="text-gray-600 mb-6">
                  We're always looking for talented tech enthusiasts to join our team. Explore current openings in sales, IT support, development, and more.
                </p>
                <motion.button 
                  className="fill-button px-6 py-3 border border-[#6a5acd] text-[#6a5acd] rounded-lg hover:bg-[#6a5acd] hover:text-white transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  View Open Positions
                </motion.button>
              </div>
              <div className="md:w-1/3 flex justify-center md:justify-end">
                <div className="relative w-48 h-48">
                  <motion.div 
                    className="absolute inset-0 bg-[#6a5acd]/10 rounded-full transform translate-x-4 translate-y-4"
                    animate={{
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, 0]
                    }}
                    transition={{
                      duration: 10,
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-white rounded-full shadow-lg">
                    <FiUsers className="w-16 h-16 text-[#6a5acd]" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Contact;