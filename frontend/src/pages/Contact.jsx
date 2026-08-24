import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMapPin, FiPhone, FiMail, FiClock, FiSend, FiUsers, FiCode, FiCpu, FiHardDrive, FiServer, FiMonitor, FiHeadphones } from 'react-icons/fi';
import { FaFacebookF, FaInstagram, FaXTwitter } from 'react-icons/fa6';
import Seo from '../components/Seo';
import openMailto from '../lib/openMailto.js';
import { openSupportChat } from '../lib/supportChat.js';
import { MINN_SOCIAL_LINKS } from '../lib/minn.js';
import {
  PHONE_DISPLAY,
  PHONE_HREF,
  SALES_EMAIL,
  SUPPORT_EMAIL,
  buildContactMailto,
  buildMailto,
} from '../lib/contact.js';

const SOCIAL_ICONS = {
  facebook: FaFacebookF,
  twitter: FaXTwitter,
  instagram: FaInstagram,
};

// FE-014 — three of the four "Connect With Us" icons were `href="#"` and the
// fourth was a GitHub mark for an account that does not exist. The three that
// do exist are MINN's, and they come from one module shared with the footer.

const REPAIR_MAILTO = buildMailto({
  subject: 'Repair booking request',
  body: [
    'Device (make and model):',
    'What is wrong with it:',
    'Preferred drop-off date:',
    'Best number to reach you on:',
  ].join('\n'),
});

const CAREERS_MAILTO = buildMailto({
  subject: 'Careers enquiry',
  body: [
    'The kind of work I am looking for:',
    'A link to my CV or portfolio:',
  ].join('\n'),
});

const Contact = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  
  // FE-014 / PORT-006 — this used to be `isSubmitting` plus a `submitStatus`
  // of 'success', set by a `setTimeout` that waited 1.5 s, showed "Message
  // Sent!" and cleared the form. Nothing was ever sent: there is no contact
  // endpoint, so every message a visitor wrote here was discarded while they
  // were told a tech expert would get back to them.
  //
  // There is no backend to add here, so the form does the honest version of
  // what it was pretending to do — it hands the message to the visitor's own
  // mail client, addressed and filled in, and says that is what it is doing
  // both before and after. Nothing here claims delivery, because nothing here
  // can observe it.
  const [handedOff, setHandedOff] = useState(false);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    openMailto(buildContactMailto(formData));
    setHandedOff(true);
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

        <Seo title="Contact" description="How to reach Netronix." />
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
                      <h3 className="font-medium text-lg mb-1">Serving Lebanon</h3>
                      <p className="opacity-80">Online ordering and delivery support across Lebanon</p>
                    </div>
                  </motion.div>
                  
                  <motion.div className="flex items-start gap-4" variants={itemVariants}>
                    <div className="mt-1 bg-white/10 p-3 rounded-full">
                      <FiPhone className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg mb-1">Call Us</h3>
                      <a href={PHONE_HREF} className="block opacity-80 underline hover:opacity-100">{PHONE_DISPLAY}</a>
                    </div>
                  </motion.div>
                  
                  <motion.div className="flex items-start gap-4" variants={itemVariants}>
                    <div className="mt-1 bg-white/10 p-3 rounded-full">
                      <FiMail className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg mb-1">Email Us</h3>
                      <a href={`mailto:${SALES_EMAIL}`} className="block opacity-80 underline hover:opacity-100">{SALES_EMAIL}</a>
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="block opacity-80 underline hover:opacity-100">{SUPPORT_EMAIL}</a>
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
                  <h3 className="font-medium text-lg mb-2">Connect With MINN</h3>
                  <p className="text-sm opacity-75 mb-4">Follow the agency behind this storefront.</p>
                  <div className="flex gap-4">
                    {MINN_SOCIAL_LINKS.map(({ platform, url, label }, index) => {
                      const Icon = SOCIAL_ICONS[platform];
                      return (
                        <motion.a
                          key={platform}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={label}
                          className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors"
                          whileHover={{ scale: 1.1, rotate: index % 2 === 0 ? 10 : -10 }}
                        >
                          <Icon className="w-6 h-6" aria-hidden="true" />
                        </motion.a>
                      );
                    })}
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
              
              <p id="contact-form-disclosure" data-testid="contact-form-disclosure" className="text-sm text-gray-600 mb-6">
                Netronix has no message inbox on this website. Sending this form opens your own
                email app with the message already written and addressed to{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#6a5acd] underline">{SUPPORT_EMAIL}</a>
                {' '}— you still have to press send there.
              </p>

              <div role="status" aria-live="polite" className="mb-6 empty:mb-0">
                {handedOff && (
                  <motion.div
                    className="bg-[#6a5acd]/5 p-6 rounded-lg border border-[#6a5acd]/20 flex items-start gap-4"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <FiMail className="text-[#6a5acd] w-6 h-6 mt-1 flex-shrink-0" aria-hidden="true" />
                    <div>
                      <h3 className="font-medium text-gray-900 text-lg">Your email app should now be open</h3>
                      <p className="text-gray-700">
                        Your message is waiting there as a draft to {SUPPORT_EMAIL}. If nothing opened,
                        copy your message and email us directly at{' '}
                        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#6a5acd] underline">{SUPPORT_EMAIL}</a>,
                        or call <a href={PHONE_HREF} className="text-[#6a5acd] underline">{PHONE_DISPLAY}</a>.
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

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
                    className="fill-button w-full md:w-auto px-8 py-4 bg-[#6a5acd] hover:bg-[#5d4ebd] text-white rounded-lg font-medium flex items-center justify-center gap-2"
                    aria-describedby="contact-form-disclosure"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <FiSend className="w-4 h-4" aria-hidden="true" />
                    <span>Open email draft</span>
                </motion.button>
              </form>
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
                <h3 className="text-lg font-semibold mb-2">Browse the Catalog</h3>
                <p className="text-gray-600 mb-4">
                  Compare the products currently available from Netronix.
                </p>
                <Link to="/products" className="text-[#6a5acd] font-medium hover:text-[#5d4ebd] flex items-center gap-1">
                  Browse products
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
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
                  Ask the Netronix assistant about products in the current catalog.
                </p>
                <button type="button" onClick={openSupportChat} className="text-[#6a5acd] font-medium hover:text-[#5d4ebd] flex items-center gap-1">
                  Start chat
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
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
                  Email the support team with your device details to request a repair.
                </p>
                <a href={REPAIR_MAILTO} className="text-[#6a5acd] font-medium hover:text-[#5d4ebd] flex items-center gap-1">
                  Book a repair
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
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Interested in Working With Netronix?</h2>
                <p className="text-gray-600 mb-6">
                  There is no public openings board right now. You can still email a CV or portfolio for future consideration.
                </p>
                <motion.a
                  href={CAREERS_MAILTO}
                  className="fill-button px-6 py-3 border border-[#6a5acd] text-[#6a5acd] rounded-lg hover:bg-[#6a5acd] hover:text-white transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Email a careers enquiry
                </motion.a>
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