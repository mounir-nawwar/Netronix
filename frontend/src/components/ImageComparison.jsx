import { useCallback, useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

// A11Y-005 / A11Y-008 — the divider was a `<motion.button>` with no accessible
// name and no keyboard behaviour: a mouse-only control with a focus ring that
// did nothing. It is a real slider now — `role="slider"`, a live
// `aria-valuenow`, and arrow/Home/End keys — and the drag interaction is
// untouched, which is the one that makes the section worth having.
const KEY_STEP = 4;

const ImageComparison = ({
    beforeImage,
    afterImage,
    beforeImageSet,
    afterImageSet,
    imageSizes,
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

    const drag = useCallback((e) => {
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
    }, [isScrolling, isHorizontal]);

    const nudge = (event) => {
        const back = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
        const forward = isHorizontal ? 'ArrowRight' : 'ArrowDown';
        let next = null;
        if (event.key === back) next = Math.max(0, percent - KEY_STEP);
        else if (event.key === forward) next = Math.min(100, percent + KEY_STEP);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = 100;
        if (next === null) return;
        event.preventDefault();
        setPercent(next);
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
    }, [isScrolling, drag]);

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
                    srcSet={beforeImageSet}
                    sizes={imageSizes}
                    alt={beforeHeading ? `${beforeHeading} — before` : 'Before'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
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
                    srcSet={afterImageSet}
                    sizes={imageSizes}
                    alt={afterHeading ? `${afterHeading} — after` : 'After'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
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
                type="button"
                role="slider"
                aria-label="Reveal more of the before or after image"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
                aria-valuetext={`${Math.round(percent)}% ${afterHeading || 'after'}`}
                aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
                onKeyDown={nudge}
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
                        aria-hidden="true"
                        focusable="false"
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

ImageComparison.propTypes = {
    beforeImage: PropTypes.string.isRequired,
    afterImage: PropTypes.string.isRequired,
    beforeImageSet: PropTypes.string,
    afterImageSet: PropTypes.string,
    imageSizes: PropTypes.string,
    beforeHeading: PropTypes.string,
    afterHeading: PropTypes.string,
    beforeSubheading: PropTypes.string,
    afterSubheading: PropTypes.string,
    layout: PropTypes.oneOf(['horizontal', 'vertical']),
    height: PropTypes.string,
    rounded: PropTypes.bool,
    fullWidth: PropTypes.bool,
    textSize: PropTypes.oneOf(['small', 'normal']),
};

export default ImageComparison; 