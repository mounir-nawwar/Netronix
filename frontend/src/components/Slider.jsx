import React, { useState, useEffect, useRef } from 'react';
import laptopCategory from '../assets/category_images/Laptops category.png';
import pcCategory from '../assets/category_images/pc pic 2.png';
import macbookCategory from '../assets/category_images/m4 pro macbook.png';
import headphonesCategory from '../assets/category_images/Headphones.jpg';
import earphonesCategory from '../assets/category_images/Earphones.jpg';
import speakersCategory from '../assets/category_images/Speakers.jpg';
import accessoriesCategory from '../assets/category_images/Accessories.jpg';
import gamingCategory from '../assets/category_images/Gaming.jpg';
const Slider = () => {
    const [active, setActive] = useState(2);
    const sliderRef = useRef(null);

    const sliderItems = [
        {
            image: laptopCategory,
            title: "Laptops",
            subtitle: "Powerful performance on the go"
        },
        {
            image: pcCategory,
            title: "Gaming PCs",
            subtitle: "Ultimate gaming experience"
        },
        {
            image: macbookCategory,
            title: "MacBooks",
            subtitle: "Premium Apple laptops"
        },
        {
            image: headphonesCategory,
            title: "Headphones",
            subtitle: "Immersive audio experience"
        },
        {
            image: earphonesCategory,
            title: "Earphones",
            subtitle: "Portable sound solutions"
        },
        {
            image: speakersCategory,
            title: "Speakers",
            subtitle: "Room-filling premium sound"
        },
        {
            image: accessoriesCategory,
            title: "Accessories",
            subtitle: "Essential tech add-ons"
        },
        {
            image: gamingCategory,
            title: "Gaming",
            subtitle: "Level up your gaming setup"
        }
    ];

    const loadShow = () => {
        if (!sliderRef.current) return;
        const items = sliderRef.current.querySelectorAll('.slider-item');

        // Get the current viewport width
        const viewportWidth = window.innerWidth;
        const isMobile = viewportWidth < 768;
        
        // Responsive values based on viewport width
        const CARD_WIDTH = isMobile ? 220 : 310;
        const CARD_HEIGHT = isMobile ? 300 : 420;
        const CENTER_GAP = isMobile ? 0 : 320;
        const SIDE_GAP = isMobile ? 50 : 160;
        const CENTER_LEFT = isMobile ? 0 : -160;
        const CENTER_RIGHT = isMobile ? 0 : 160;

        items.forEach((item, index) => {
            // Update card dimensions
            item.style.width = `${CARD_WIDTH}px`;
            item.style.height = `${CARD_HEIGHT}px`;
            item.style.left = `calc(50% - ${CARD_WIDTH / 2}px)`;

            if (isMobile) {
                if (index === active) {
                    // Active card for mobile
                    item.style.transform = 'translateX(0)';
                    item.style.zIndex = '1';
                    item.style.filter = 'none';
                    item.style.opacity = '1';
                } else if (index > active) {
                    // Cards to the right on mobile
                    const position = index - active;
                    const xOffset = SIDE_GAP * position;
                    const scale = 1 - 0.15 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(-1deg)`;
                    item.style.zIndex = `-${position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                } else {
                    // Cards to the left on mobile
                    const position = active - index;
                    const xOffset = -SIDE_GAP * position;
                    const scale = 1 - 0.15 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(1deg)`;
                    item.style.zIndex = `-${position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                }
            } else {
                // Desktop version remains unchanged
                if (index === active) {
                    item.style.transform = `translateX(${CENTER_LEFT}px)`;
                    item.style.zIndex = '1';
                    item.style.filter = 'none';
                    item.style.opacity = '1';
                } else if (index === active + 1) {
                    item.style.transform = `translateX(${CENTER_RIGHT}px)`;
                    item.style.zIndex = '1';
                    item.style.filter = 'none';
                    item.style.opacity = '1';
                } else if (index > active + 1) {
                    const position = index - (active + 1);
                    const xOffset = CENTER_RIGHT + SIDE_GAP * position;
                    const scale = 1 - 0.2 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(-1deg)`;
                    item.style.zIndex = `-${position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                } else {
                    const position = active - index;
                    const xOffset = CENTER_LEFT - SIDE_GAP * position;
                    const scale = 1 - 0.2 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(1deg)`;
                    item.style.zIndex = `-${position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                }
            }
        });
    };

    const handleNext = () => {
        setActive(prev => prev + 1 < sliderItems.length - 1 ? prev + 1 : prev);
    };

    const handlePrev = () => {
        setActive(prev => prev - 1 >= 0 ? prev - 1 : prev);
    };

    useEffect(() => {
        if (sliderRef.current) {
            loadShow();
        }
    }, [active]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadShow();
        }, 300);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="mt-8 md:mt-24 w-full px-4 py-12">
            {/* Section Heading and Subheading */}
            <div className="text-center">
                <h2 className="text-2xl md:text-[42px] font-michroma text-gray-900 mb-4">
                    Featured Collections
                </h2>
                <p className="text-sm md:text-lg text-gray-600 max-w-3xl mx-auto font-michroma">
                    Discover premium technology and carefully curated products designed for performance and reliability.
                </p>
            </div>

            <div className="w-full min-h-[40vh] md:min-h-[70vh] flex justify-center items-center relative">
                <div className="slider relative w-full h-[300px] md:h-[470px]" ref={sliderRef}>
                    {sliderItems.map((item, index) => (
                        <div
                            key={index}
                            className="slider-item absolute transition-all duration-500 group cursor-pointer"
                        >
                            <a href="#" className="media-card__link flex flex-col w-full h-full relative">
                                {/* Card Container with Background */}
                                <div className="absolute inset-0 bg-[#f9f9f9] rounded-2xl overflow-hidden">
                                    {/* Media Container */}
                                    <div className="media relative w-full h-[160px] md:h-[280px] bg-[#f9f9f9] rounded-t-2xl z-[5]">
                                        <div className="absolute">
                                            <img
                                                src={item.image}
                                                alt={item.title}
                                                className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                        </div>
                                    </div>

                                    {/* Content Container */}
                                    <div className="media-card__content mb-4 md:mb-5 flex justify-between items-start gap-3 md:gap-4 w-full p-3 md:p-5 bg-[#f9f9f9] absolute bottom-0 left-0 right-0">
                                        <div className="media-card__text shrink-1 grid gap-0.5 md:gap-1">
                                            <p className="flex">
                                                <span className="heading text-sm md:text-lg xl:text-xl tracking-tighter leading-tight font-michroma text-gray-900 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300 after:ease-in-out">
                                                    {item.title}
                                                </span>
                                            </p>
                                            {item.subtitle && (
                                                <p className="text-[9px] md:text-[12px] leading-relaxed font-michroma text-gray-600">{item.subtitle}</p>
                                            )}
                                        </div>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-3 w-3 md:h-5 md:w-5 text-[#6a5acd] transform transition-transform duration-300 group-hover:translate-x-2 shrink-0 mt-1"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 5l7 7-7 7"
                                            />
                                        </svg>
                                    </div>
                                </div>
                            </a>
                        </div>
                    ))}

                    <button
                        onClick={handlePrev}
                        className="absolute top-[45%] left-[5%] text-[#6a5acd] bg-[#f9f9f9] rounded-full p-3 z-10 hover:scale-110 transition-transform flex items-center justify-center shadow-md"
                        aria-label="Previous slide"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-[#6a5acd]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                    </button>
                    <button
                        onClick={handleNext}
                        className="absolute top-[45%] right-[5%] text-[#6a5acd] bg-[#f9f9f9] rounded-full p-3 z-10 hover:scale-110 transition-transform flex items-center justify-center shadow-md"
                        aria-label="Next slide"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6 text-[#6a5acd]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Slider; 