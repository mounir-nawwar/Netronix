import React, { useEffect, useState } from 'react';

// Import new brand logos
import appleLogoUrl from '../assets/brands/Apple_logo_black.svg';
import samsungLogoUrl from '../assets/brands/samsung.svg';
import msiLogoUrl from '../assets/brands/msi.svg';
import acerLogoUrl from '../assets/brands/acer.svg';
import amdLogoUrl from '../assets/brands/amd.svg';
import razerLogoUrl from '../assets/brands/razer.svg';
import hpLogoUrl from '../assets/brands/hp.svg';
import lenovoLogoUrl from '../assets/brands/lenovo.svg';
import sonyLogoUrl from '../assets/brands/aony.svg';
import nvidiaLogoUrl from '../assets/brands/Nvidia_logo.svg';

// Brand logos array with consistent sizing - adjusted for visual weight
const brandLogos = [
  { id: 1, url: appleLogoUrl, alt: 'Apple', width: 30, height: 36 },
  { id: 2, url: samsungLogoUrl, alt: 'Samsung', width: 100, height: 80 },
  { id: 3, url: razerLogoUrl, alt: 'Razer', width: 86, height: 36 },
  { id: 4, url: msiLogoUrl, alt: 'MSI', width: 70, height: 20 },
  { id: 5, url: acerLogoUrl, alt: 'Acer', width: 75, height: 65 },
  { id: 6, url: hpLogoUrl, alt: 'HP', width: 36, height: 36 },
  { id: 7, url: lenovoLogoUrl, alt: 'Lenovo', width: 85, height: 80 },
  { id: 8, url: amdLogoUrl, alt: 'AMD', width: 80, height: 80 },
  { id: 9, url: nvidiaLogoUrl, alt: 'NVIDIA', width: 90, height: 40 },
];

// Duplicate for seamless scrolling
const allLogos = [...brandLogos, ...brandLogos];

const LogoMarquee = () => {
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Scale factor for mobile
  const scaleFactor = windowWidth < 768 ? 0.6 : 1;

  return (
    <>
      <style>
        {`
          @keyframes marquee-left {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          
          @keyframes marquee-right {
            0% { transform: translateX(-50%); }
            100% { transform: translateX(0); }
          }
          
          .animate-marquee-left {
            animation: marquee-left 25s linear infinite;
          }
          
          .animate-marquee-right {
            animation: marquee-right 25s linear infinite;
          }
          
          @media (min-width: 768px) {
            .animate-marquee-left {
              animation: marquee-left 30s linear infinite;
            }
            
            .animate-marquee-right {
              animation: marquee-right 30s linear infinite;
            }
          }
          
          .animate-marquee-left:hover,
          .animate-marquee-right:hover {
            animation-play-state: paused;
          }
        `}
      </style>
      <section className="overflow-visible py-4 md:py-8 -mt-6 md:-mt-24 relative">
        {/* First marquee - rotated counterclockwise and moving right */}
        <div className="relative transform -rotate-[3deg] z-20 py-3 md:py-6 overflow-hidden bg-[#f9f9f9] shadow-md -mx-1 mb-8 md:mb-14 w-[110%]">
          <div className="flex whitespace-nowrap animate-marquee-right">
            {allLogos.map((logo, index) => (
              <div 
                key={`top-${logo.id}-${index}`} 
                className="mx-8 md:mx-16 flex-shrink-0 flex items-center justify-center"
              >
                <div 
                  style={{ 
                    width: `${logo.width * scaleFactor}px`, 
                    height: `${logo.height * scaleFactor}px`,
                  }}
                  className="flex items-center justify-center"
                >
                  <img 
                    src={logo.url} 
                    alt={logo.alt}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    style={{ 
                      filter: "grayscale(100%) brightness(0%) contrast(1)",
                      maxWidth: "100%",
                      maxHeight: "100%"
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Second marquee - rotated clockwise and moving left */}
        <div className="relative transform rotate-[4deg] -mt-6 md:-mt-12 py-3 md:py-6 bg-[#6a5acd] z-10 overflow-hidden w-[110%]">
          <div className="flex whitespace-nowrap animate-marquee-left">
            {allLogos.map((logo, index) => (
              <div 
                key={`bottom-${logo.id}-${index}`} 
                className="mx-8 md:mx-16 flex-shrink-0 flex items-center justify-center"
              >
                <div 
                  style={{ 
                    width: `${logo.width * scaleFactor}px`, 
                    height: `${logo.height * scaleFactor}px`,
                  }}
                  className="flex items-center justify-center"
                >
                  <img 
                    src={logo.url} 
                    alt={logo.alt}
                    className="w-full h-full object-contain"
                    loading="lazy"
                    style={{ 
                      filter: "grayscale(100%) brightness(0%) contrast(1) invert(1)",
                      maxWidth: "100%",
                      maxHeight: "100%"
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default LogoMarquee; 