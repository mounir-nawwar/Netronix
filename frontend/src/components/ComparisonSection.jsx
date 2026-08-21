import ImageComparison from './ImageComparison';
import { useNavigate } from 'react-router-dom';

// PERF-004 — 2560×2560 PNGs (1.18 MB and 914 kB) for a square that is never
// wider than about 640 CSS px. WebP at 800 and 1600, chosen by the browser.
import before800 from '../assets/optimised/comparison-before-800.webp';
import before1600 from '../assets/optimised/comparison-before-1600.webp';
import after800 from '../assets/optimised/comparison-after-800.webp';
import after1600 from '../assets/optimised/comparison-after-1600.webp';

const ComparisonSection = () => {
    const navigate = useNavigate();

    const handleButtonClick = () => {
        // Ensure body scroll is restored
        document.body.style.overflow = 'auto';
        
        // Navigate to products page with MacBooks tag filter
        navigate('/products?tag=MacBooks');
    };

    return (
        <section className="bg-black">
            <div className='pt-8 md:pt-16 pb-12 md:pb-20 px-4 rounded-t-3xl w-full h-full bg-white'>
                <div className="max-w-7xl mx-auto bg-white">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12 items-center">
                        {/* Title Section - Left Side */}
                        <div className="lg:pr-8 text-center lg:text-left">
                            <h3 className="text-sm md:text-xl font-michroma text-gray-600 mb-2 md:mb-4">
                                Precision. Power.
                            </h3>
                            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-michroma bg-gradient-to-r from-[#d5d6d8] to-[#353332] bg-clip-text text-transparent leading-tight mb-3 md:mb-6">
                                M4 Pro: A Choice of Style and Power
                            </h2>
                            <p className="text-xs sm:text-sm md:text-base lg:text-lg text-gray-600 font-michroma leading-relaxed">
                                Experience next-generation performance with a design that matches your style. Choose between the sleek sophistication of silver or the bold presence of black.
                            </p>
                            <div className="flex justify-center lg:justify-start">
                                <button 
                                    onClick={handleButtonClick}
                                    className="mt-3 md:mt-5 px-4 md:px-6 py-2 md:py-3 bg-white text-black border border-black rounded-[3px] font-michroma text-xs md:text-sm fill-button fill-button-black-outline max-w-[200px]"
                                >
                                    Check it out
                                </button>
                            </div>
                        </div>

                        {/* Image Comparison Component - Right Side */}
                        <div className="w-full aspect-square mt-4 md:mt-0">
                            <ImageComparison
                                beforeImage={before800}
                                beforeImageSet={`${before800} 800w, ${before1600} 1600w`}
                                afterImage={after800}
                                afterImageSet={`${after800} 800w, ${after1600} 1600w`}
                                imageSizes="(max-width: 1023px) 92vw, 46vw"
                                beforeHeading="Sleek Precision"
                                afterHeading="Bold Performance"
                                beforeSubheading="Classic. Timeless. Efficient."
                                afterSubheading="Modern. Powerful. Striking."
                                layout="horizontal"
                                height="100%"
                                rounded={true}
                                fullWidth={true}
                                textSize="small"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ComparisonSection; 