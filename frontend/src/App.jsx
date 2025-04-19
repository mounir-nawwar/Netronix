import React, { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Collections from './pages/Collections'
import AllProducts from './pages/AllProducts'
import Product from './pages/Product'
import Cart from './pages/Cart'
import PlaceOrder from './pages/PlaceOrder'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import LogIn from './pages/LogIn'
import NewsLetterBar from './components/NewsLetterBar'
import Orders from './pages/Orders'
import About from './pages/About'
import Contact from './pages/Contact'
import Wishlist from './pages/Wishlist'
import ShopContextProvider from './context/ShopContext'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import ChatBotWidget from './components/Chatbot/ChatBotWidget'

export const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

function App() {
  const location = useLocation();
  const [prevScrollPos, setPrevScrollPos] = useState(0);
  const [visible, setVisible] = useState(true);

  const handleScroll = () => {
    const currentScrollPos = window.scrollY;
    setVisible(prevScrollPos > currentScrollPos || currentScrollPos < 10);
    setPrevScrollPos(currentScrollPos);
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [prevScrollPos, visible]);

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <ShopContextProvider>
      <div className='bg-white'>
        <Navbar visible={visible} />
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/collections/*' element={<Collections />} />
          <Route path='/products' element={<AllProducts />} />
          <Route path='/product/:productId' element={<Product />} />
          <Route path='/cart' element={<Cart />} />
          <Route path='/login' element={<LogIn />} />
          <Route path='/placeorder' element={<PlaceOrder />} />
          <Route path='/orders' element={<Orders />} />
          <Route path='/wishlist' element={<Wishlist />} />
          <Route path='/about' element={<About />} />
          <Route path='/contact' element={<Contact />} />
        </Routes>
        <NewsLetterBar />
        <Footer />
        <ChatBotWidget />
        <ToastContainer
          position="bottom-right"
          autoClose={3000}
          newestOnTop
          closeOnClick
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
          closeButton={false}
        />
      </div>
    </ShopContextProvider>
  )
}

export default App

