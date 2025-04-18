import React, { useEffect, useState } from 'react'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import { Routes, Route, Navigate } from 'react-router-dom'
import Add from './pages/Add'
import List from './pages/List'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import Login from './components/Login'
import Users from './pages/Users'
import Settings from './pages/Settings'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


export const backendUrl = import.meta.env.VITE_BACKEND_URL;
export const currency = '$'
const App = () => {

  const [token, setToken] = useState(localStorage.getItem( 'token')? localStorage.getItem('token'):'');


  useEffect(()=>{
    localStorage.setItem('token', token )
  },[token])

  return (
    <div className='bg-gray-50 min-h-screen'>
      <ToastContainer/>
      {token === ""
        ? <Login setToken = {setToken}/>
        : <>
          <Navbar setToken= {setToken}/>
          <div className='flex'>
            <Sidebar />
            <div className='ml-[250px] w-[calc(100%-250px)] pt-20 p-8'>
              <Routes>
                <Route path='/' element={<Dashboard token={token} />} />
                <Route path='/dashboard' element={<Dashboard token={token} />} />
                <Route path='/add' element={<Add token={token} />} />
                <Route path='/list' element={<List token={token} />} />
                <Route path='/orders' element={<Orders token={token} />} />
                <Route path='/users' element={<Users token={token} />} />
                <Route path='/settings' element={<Settings token={token} />} />
                <Route path='*' element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </div>
        </>
      }
    </div>
  )
}

export default App