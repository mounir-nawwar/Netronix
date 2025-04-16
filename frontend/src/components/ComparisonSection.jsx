import React from 'react';
import ImageComparison from './ImageComparison';

// Import your comparison images
import beforeImage from '../assets/comparison/before.png';
import afterImage from '../assets/comparison/after.png';

const ComparisonSection = () => {
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
                                <button className="mt-3 md:mt-5 px-4 md:px-6 py-2 md:py-3 bg-white text-black border border-black rounded-[3px] font-michroma text-xs md:text-sm fill-button fill-button-black-outline max-w-[200px]">
                                    Check it out
                                </button>
                            </div>
                        </div>

                        {/* Image Comparison Component - Right Side */}
                        <div className="w-full aspect-square mt-4 md:mt-0">
                            <ImageComparison
                                beforeImage={beforeImage}
                                afterImage={afterImage}
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