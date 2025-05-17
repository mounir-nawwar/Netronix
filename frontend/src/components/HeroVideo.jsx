import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import videoSrc from '../assets/Videos/Razer AD.mp4';
import { Link } from 'react-router-dom';

const HeroVideo = () => {
    const [isPlaying, setIsPlaying] = useState(true);
    const videoRef = useRef(null);
    const productId = "680262846be92b2511550a66"; // Razer Cobra Mouse ID

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    return (
        <section className="w-full bg-black rounded-t-[30px]">
            {/* Video Container */}
            <div className="relative max-h-[100vh] w-full overflow-hidden rounded-t-[30px]">
                <video
                    ref={videoRef}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                    src={videoSrc}
                    controls
                    loading="lazy"
                />

                {/* Content Overlay */}
                <div className="absolute inset-0 bg-black/30">
                    {/* Desktop: Bottom Left Content */}
                    <div className="hidden sm:block absolute bottom-12 md:bottom-16 left-8 md:left-20 max-w-sm md:max-w-xl">
                        <h1 className="text-2xl md:text-4xl font-michroma text-white mb-3 md:mb-4 leading-tight">
                            Razer Cobra Line – Precision Redefined
                        </h1>
                        <p className="text-base md:text-lg text-white/80 font-michroma mb-6 md:mb-8 leading-snug">
                            Experience next-level speed and control with cutting-edge technology.
                        </p>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            className="bg-white text-black font-michroma px-6 md:px-8 py-3 md:py-4 rounded-full inline-flex items-center gap-2 text-sm md:text-base fill-button fill-button-black-outline"
                        >
                            <Link 
                                to={`/product/${productId}`} className='font-michroma'
                            >
                                View Details
                            </Link>

                            <svg className="w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </motion.button>
                    </div>

                    {/* Mobile: Bottom Left Content */}
                    <div className="sm:hidden absolute bottom-4 left-4 max-w-[200px]">
                        <h1 className="text-sm font-michroma text-white mb-2 leading-tight">
                            Razer Cobra Line – Precision Redefined
                        </h1>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            className="bg-white text-black font-michroma px-5 py-2 rounded-full inline-flex items-center gap-1 text-xs fill-button fill-button-black-outline"
                        >
                            <Link 
                                to={`/product/${productId}`} className='font-michroma'
                            >
                                View Details
                            </Link>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </motion.button>
                    </div>
                </div>

                {/* Play/Pause Button */}
                <button
                    onClick={togglePlay}
                    className="absolute bottom-4 sm:bottom-6 md:bottom-8 right-4 sm:right-6 md:right-8 w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-white rounded-full flex items-center justify-center hover:bg-white/90 transition-colors"
                >
                    {isPlaying ? (
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
            </div>
        </section>
    );
};

export default HeroVideo; 