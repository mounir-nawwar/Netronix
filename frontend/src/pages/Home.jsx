import React from 'react'
import Hero from '../components/Hero'
import Slider from '../components/Slider'
import LogoMarquee from '../components/LogoMarquee'
import FeaturedProducts from '../components/FeaturedProducts'
import ComparisonSection from '../components/ComparisonSection'
import HeroVideo from '../components/HeroVideo'
import FeaturedProduct from '../components/FeaturedProduct'
import ShopTheLook from '../components/ShopTheLook'
import CountdownBanner from '../components/CountdownBanner'
import Testimonials from '../components/Testimonials'

const Home = () => {
  return (
    <div className="min-h-screen">
      <Hero/>
      <div className="slider-container w-full">
        <Slider/>
      </div>
      <LogoMarquee/>
      <div className='px-4 sm:px-[5vw] md:px-[7vw] lg:px-[9vw]'>
          <FeaturedProducts/>
      </div>
      <CountdownBanner />
      <ComparisonSection/>
      <HeroVideo/>
      <FeaturedProduct/>
      <ShopTheLook/>
      <Testimonials />
    </div>
  )
}

export default Home