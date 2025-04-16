import React, { useEffect, useRef } from 'react';

// Import logo SVGs
import appleLogoUrl from '../assets/brands/apple-logo.svg';
import boseLogoUrl from '../assets/brands/bose-logo.svg';
import logiLogoUrl from '../assets/brands/logitech-logo.svg';
import bowersLogoUrl from '../assets/brands/bowers-logo.svg';
import urbanLogoUrl from '../assets/brands/urbanista-logo.svg';
import masterLogoUrl from '../assets/brands/master-logo.svg';

// Brand logos array
const brandLogos = [
  { id: 1, url: urbanLogoUrl, alt: 'Urbanista', height: { mobile: 25, desktop: 40 } },
  { id: 2, url: bowersLogoUrl, alt: 'Bowers & Wilkins', height: { mobile: 25, desktop: 40 } },
  { id: 3, url: boseLogoUrl, alt: 'Bose', height: { mobile: 25, desktop: 40 } },
  { id: 4, url: masterLogoUrl, alt: 'Master & Dynamic', height: { mobile: 35, desktop: 60 } },
  { id: 5, url: logiLogoUrl, alt: 'Logitech', height: { mobile: 25, desktop: 40 } },
  { id: 6, url: appleLogoUrl, alt: 'Apple', height: { mobile: 30, desktop: 50 } },
  { id: 7, url: urbanLogoUrl, alt: 'Urbanista', height: { mobile: 25, desktop: 40 } },
  { id: 8, url: boseLogoUrl, alt: 'Bose', height: { mobile: 25, desktop: 40 } },
];

// Duplicate for seamless scrolling
const allLogos = [...brandLogos, ...brandLogos];

const LogoMarquee = () => {
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
            animation: marquee-left 20s linear infinite;
          }
          
          .animate-marquee-right {
            animation: marquee-right 20s linear infinite;
          }
          
          @media (min-width: 768px) {
            .animate-marquee-left {
              animation: marquee-left 25s linear infinite;
            }
            
            .animate-marquee-right {
              animation: marquee-right 25s linear infinite;
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
                className="mx-8 md:mx-16 flex-shrink-0"
              >
                <img 
                  src={logo.url} 
                  alt={logo.alt}
                  className="w-auto object-contain"
                  loading="lazy"
                  style={{ height: `${logo.height.mobile}px` }}
                />
              </div>
            ))}
            {allLogos.map((logo, index) => (
              <div 
                key={`top-duplicate-${logo.id}-${index}`} 
                className="mx-8 md:mx-16 flex-shrink-0"
              >
                <img 
                  src={logo.url} 
                  alt={logo.alt}
                  className="w-auto object-contain"
                  loading="lazy"
                  style={{ height: `${logo.height.mobile}px` }}
                />
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
                className="mx-8 md:mx-16 flex-shrink-0"
              >
                <img 
                  src={logo.url} 
                  alt={logo.alt}
                  className="w-auto object-contain filter invert"
                  loading="lazy"
                  style={{ height: `${logo.height.mobile}px` }}
                />
              </div>
            ))}
            {allLogos.map((logo, index) => (
              <div 
                key={`bottom-duplicate-${logo.id}-${index}`} 
                className="mx-8 md:mx-16 flex-shrink-0"
              >
                <img 
                  src={logo.url} 
                  alt={logo.alt}
                  className="w-auto object-contain filter invert"
                  loading="lazy"
                  style={{ height: `${logo.height.mobile}px` }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default LogoMarquee; 