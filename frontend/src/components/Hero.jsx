import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const Hero = () => {
  useEffect(() => {
    // Spline script
    if (!document.querySelector('script[src*="splinetool/viewer"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://unpkg.com/@splinetool/viewer@1.9.79/build/spline-viewer.js';
      document.head.appendChild(script);
    }
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden max-w-[100vw] max-h-[100vh]">
      {/* Spline 3D Scene */}
      <div className="absolute inset-0 w-full h-full">
        <spline-viewer
          url="https://prod.spline.design/nUgvQmkZtHhCinLK/scene.splinecode"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Hero Text */}
      <div
        className="absolute top-1/3 left-[10vw] max-w-[40vw] z-10"
        style={{
          opacity: 0,
          transform: 'translateX(-500px)',
          animation: 'slideInFromLeft 4s ease-in-out forwards'
        }}
      >
        <h1 className="text-[54px] mt-[20px] mb-[46px] font-michroma leading-[44px] text-[#333]">
          Next-Gen Tech, Delivered.
        </h1>
        <p className="text-[20px] max-w-[28vw] leading-[25px] font-michroma text-[#333]">
          Your gateway to the latest and greatest in computers, accessories, and gaming gear.
          Upgrade your setup with Netronix—where innovation meets performance.
        </p>
        <Link
          to="#"
          className="inline-block mt-[25px] px-[20px] py-[15px] bg-[#6a5acd] text-[#f4f4f4] text-[14px] leading-[20px] rounded-lg font-michroma fill-button fill-button-hero"
        >
          Shop Now
        </Link>
      </div>
    </div>
  );
};

export default Hero;
