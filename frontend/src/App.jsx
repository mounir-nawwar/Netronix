import React, { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Collections from './pages/Collections'
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
import ShopContextProvider from './context/ShopContext'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

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
    <div>
      <ShopContextProvider>
        <Navbar visible={visible} />
        <NewsLetterBar />
        <ToastContainer />
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/collections/:category' element={<Collections />} />
          <Route path='/collections/tag/:tag' element={<Collections />} />
          <Route path='/collections/:category/:subCategory' element={<Collections />} />
          <Route path='/product/:productId' element={<Product />} />
          <Route path='/cart' element={<Cart />} />
          <Route path='/placeorder' element={<PlaceOrder />} />
          <Route path='/orders' element={<Orders />} />
          <Route path='/login' element={<LogIn/>} />
          <Route path='/about' element={<About />} />
          <Route path='/contact' element={<Contact />} />
        </Routes>
        <Footer />
      </ShopContextProvider>
    </div>
  )
}

export default App

