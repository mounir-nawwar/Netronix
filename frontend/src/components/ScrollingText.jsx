import React, { useEffect, useRef, useState } from 'react';

const ScrollingText = ({ text = "Premium tech · Exceptional performance", speed = 2.5 }) => {
  const scrollContainerRef = useRef(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [lastScrollTop, setLastScrollTop] = useState(0);
  const [scrollDirection, setScrollDirection] = useState(null);
  const [basePosition, setBasePosition] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Calculate the content and container widths
  useEffect(() => {
    if (scrollContainerRef.current) {
      const updateWidths = () => {
        const containerWidth = scrollContainerRef.current.parentElement.offsetWidth;
        const contentWidth = scrollContainerRef.current.scrollWidth;
        setContainerWidth(containerWidth);
        setContentWidth(contentWidth);
      };

      updateWidths();
      window.addEventListener('resize', updateWidths);
      return () => window.removeEventListener('resize', updateWidths);
    }
  }, []);

  useEffect(() => {
    // Animation function for continuous scrolling
    let animationFrameId;
    let position = basePosition;

    const animate = () => {
      position -= speed;
      
      // Add scroll direction effect
      if (scrollDirection === 'down') {
        position -= speed * 2; // Move faster to the left when scrolling down
      } else if (scrollDirection === 'up') {
        position += speed * 3; // Move to the right when scrolling up
      }
      
      // Create a seamless infinite scroll effect
      // When a text segment is completely out of view, reposition it
      const firstSegmentWidth = contentWidth / 10; // Width of one text segment
      if (position <= -firstSegmentWidth) {
        // Instead of resetting to 0, just move ahead by one segment length
        // This creates the illusion of continuous motion
        position += firstSegmentWidth;
      }
      
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.transform = `translateX(${position}px)`;
      }
      
      setBasePosition(position);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    // Scroll event listener
    const handleScroll = () => {
      const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      if (currentScrollTop > lastScrollTop) {
        // Scrolling down
        setScrollDirection('down');
      } else {
        // Scrolling up
        setScrollDirection('up');
      }
      
      // Update scroll position
      setScrollPosition(currentScrollTop);
      setLastScrollTop(currentScrollTop);
      
      // Reset scroll direction after a short delay
      setTimeout(() => {
        setScrollDirection(null);
      }, 300);
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, [speed, scrollDirection, lastScrollTop, basePosition, contentWidth]);

  // Create enough repeating text to fill the screen at least twice
  const repeatedText = Array(20).fill(text).join(' ');

  return (
    <div className="w-full overflow-hidden py-4 md:py-8">
      <div 
        ref={scrollContainerRef} 
        className="whitespace-nowrap text-[10vw] font-michroma text-transparent inline-block"
        style={{
          WebkitTextStroke: '1px #000',
          textStroke: '1px #000',
        }}
      >
        {repeatedText}
      </div>
    </div>
  );
};

export default ScrollingText; 