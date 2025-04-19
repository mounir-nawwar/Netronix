import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Spline from '@splinetool/react-spline';

const Hero = () => {
  useEffect(() => {
    // Spline script
    if (!document.querySelector('script[src*="splinetool/viewer"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@splinetool/viewer@1.9.82/build/spline-viewer.js';
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden max-w-[100vw] max-h-[100vh]">
      {/* Spline 3D Scene */}
      <div className="absolute inset-0 w-full h-full">
      <iframe src='https://my.spline.design/nexbotrobotcharacterconcept-98ea87efdaff8e9988041f9b62305dbe/' frameborder='0' width='100%' height='100%'></iframe>
      </div>

      {/* Hero Text */}
      <div
        className="absolute z-10 md:top-1/3 md:left-[10vw] md:max-w-[40vw] 
                  top-[10%] left-0 w-full px-6 md:px-0 text-center md:text-left"
        style={{
          opacity: 0,
          transform: 'translateX(-500px)',
          animation: 'slideInFromLeft 4s ease-in-out forwards'
        }}
      >
        <style>
          {`
            @media (max-width: 768px) {
              .hero-container {
                transform: none !important;
                animation: none !important;
                opacity: 1 !important;
              }
            }
          `}
        </style>
        <div className="hero-container">
          <h1 className="text-[28px] md:text-[54px] mt-[55px] mb-[20px] md:mb-[46px] font-michroma md:leading-[44px] leading-tight text-[#333]">
            Next-Gen Tech, Delivered.
          </h1>
          <p className="text-[14px] md:text-[20px] mx-auto md:mx-0 max-w-[85%] md:max-w-[28vw] leading-[20px] md:leading-[25px] font-michroma text-[#333]">
            Your gateway to the latest and greatest in computers, accessories, and gaming gear.
            Upgrade your setup with Netronix—where innovation meets performance.
          </p>
          <Link
            to="#"
            className="hidden md:inline-block mt-[25px] px-[20px] py-[15px] bg-[#6a5acd] text-[#f4f4f4] text-[14px] leading-[20px] rounded-lg font-michroma fill-button fill-button-hero"
          >
            Shop Now
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Hero;
