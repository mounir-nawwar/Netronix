import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

const ImageComparison = ({
    beforeImage,
    afterImage,
    beforeHeading,
    afterHeading,
    beforeSubheading,
    afterSubheading,
    layout = 'horizontal',
    height = '500px',
    rounded = false,
    fullWidth = false,
    textSize = 'normal'
}) => {
    const [percent, setPercent] = useState(50);
    const [isScrolling, setIsScrolling] = useState(false);
    const [hasAnimated, setHasAnimated] = useState(false);
    const containerRef = useRef(null);
    const isHorizontal = layout === 'horizontal';

    // Determine text size classes based on textSize prop
    const headingClass = textSize === 'small' ? 'text-lg md:text-xl' : 'text-2xl';
    const subheadingClass = textSize === 'small' ? 'text-xs md:text-sm' : 'text-sm';

    useEffect(() => {
        // Initial animation
        setTimeout(() => {
            setHasAnimated(true);
        }, 100);
    }, []);

    const startDragging = (e) => {
        e.preventDefault();
        setIsScrolling(true);
    };

    const stopDragging = () => {
        setIsScrolling(false);
    };

    const drag = (e) => {
        if (!isScrolling || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
        const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

        if (isHorizontal) {
            const width = containerRef.current.clientWidth;
            const newPercent = Math.max(0, Math.min(100, (x * 100) / width));
            setPercent(newPercent);
        } else {
            const height = containerRef.current.clientHeight;
            const newPercent = Math.max(0, Math.min(100, (y * 100) / height));
            setPercent(newPercent);
        }
    };

    useEffect(() => {
        if (isScrolling) {
            window.addEventListener('mousemove', drag);
            window.addEventListener('touchmove', drag);
            window.addEventListener('mouseup', stopDragging);
            window.addEventListener('touchend', stopDragging);
        }

        return () => {
            window.removeEventListener('mousemove', drag);
            window.removeEventListener('touchmove', drag);
            window.removeEventListener('mouseup', stopDragging);
            window.removeEventListener('touchend', stopDragging);
        };
    }, [isScrolling]);

    return (
        <div
            ref={containerRef}
            className={`relative overflow-hidden ${rounded ? 'rounded-2xl' : ''} ${fullWidth ? 'w-full' : 'max-w-7xl mx-auto'}`}
            style={{ height }}
        >
            {/* Before Image */}
            <div className="flex justify-center items-center absolute inset-0 w-full h-full">
                <img
                    src={beforeImage}
                    alt="Before"
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                {(beforeHeading || beforeSubheading) && (
                    <div className="absolute bottom-6 left-6" style={{ maxWidth: `calc(${percent}% - 40px)` }}>
                        {beforeSubheading && (
                            <p className={`${subheadingClass} font-michroma text-black opacity-80 truncate`}>{beforeSubheading}</p>
                        )}
                        {beforeHeading && (
                            <p className={`${headingClass} font-michroma text-black truncate`}>{beforeHeading}</p>
                        )}
                    </div>
                )}
            </div>

            {/* After Image */}
            <motion.div
                className="absolute inset-0 w-full h-full flex justify-center items-center pt-[15px]"
                initial={{ clipPath: isHorizontal ? 'inset(0 0 0 10%)' : 'inset(10% 0 0 0)' }}
                animate={{
                    clipPath: isHorizontal
                        ? `inset(0 0 0 ${percent}%)`
                        : `inset(${percent}% 0 0 0)`
                }}
                transition={{ duration: hasAnimated ? 0 : 0.5 }}
            >
                <img
                    src={afterImage}
                    alt="After"
                    className="w-full h-full object-cover"
                    loading="lazy"
                />
                {(afterHeading || afterSubheading) && (
                    <div className="absolute bottom-6 right-6 text-right" style={{ maxWidth: `calc(${100 - percent}% - 40px)` }}>
                        {afterSubheading && (
                            <p className={`${subheadingClass} font-michroma text-black opacity-80 truncate`}>{afterSubheading}</p>
                        )}
                        {afterHeading && (
                            <p className={`${headingClass} font-michroma text-black truncate`}>{afterHeading}</p>
                        )}
                    </div>
                )}
            </motion.div>

            {/* White Line Splitter */}
            <div
                className="absolute z-10 bg-white w-[2px] h-full"
                style={{
                    left: `${percent}%`,
                    transform: 'translateX(-50%)'
                }}
            />

            {/* Drag Handle */}
            <motion.button
                className={`absolute z-20 ${isHorizontal ? 'h-full cursor-col-resize' : 'w-full cursor-row-resize'}`}
                style={{
                    top: isHorizontal ? 0 : `${percent}%`,
                    left: isHorizontal ? `${percent}%` : 0,
                    transform: isHorizontal ? 'translateX(-50%)' : 'translateY(-50%)',
                    width: isHorizontal ? '44px' : '100%',
                    height: isHorizontal ? '100%' : '44px'
                }}
                onMouseDown={startDragging}
                onTouchStart={startDragging}
                animate={{
                    top: isHorizontal ? 0 : `${percent}%`,
                    left: isHorizontal ? `${percent}%` : 0
                }}
                transition={{ duration: hasAnimated ? 0 : 0.5 }}
            >
                <div
                    className={`absolute top-1/2 left-1/2 w-[28px] md:w-[38px] h-[48px] md:h-[64px] -translate-x-1/2 -translate-y-1/2 bg-white rounded-full flex items-center justify-center shadow-lg ${isHorizontal ? '' : 'rotate-90'}`}
                >
                    <svg 
                        className="w-[12px] h-[24px]" 
                        viewBox="0 0 12 17" 
                        stroke="currentColor" 
                        fill="none" 
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path strokeLinecap="round" strokeWidth="1.5" d="M1 1L0.999999 9"></path>
                        <path strokeLinecap="round" strokeWidth="1.5" d="M6 1L6 9"></path>
                        <path strokeLinecap="round" strokeWidth="1.5" d="M11 1L11 9"></path>
                    </svg>
                </div>
            </motion.button>
        </div>
    );
};

export default ImageComparison; 