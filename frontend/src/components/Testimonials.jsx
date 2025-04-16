import React, { useState } from 'react';
import { motion } from 'framer-motion';

const testimonials = [
    {
        id: 1,
        text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
        author: "@jennifer.a",
        avatar: "https://i.pravatar.cc/100?img=1"
    },
    {
        id: 2,
        text: "I just love how these people build this system!",
        author: "@jamescron",
        avatar: "https://i.pravatar.cc/100?img=2"
    },
    {
        id: 3,
        text: "A must have UI kit for building my landing pages.",
        author: "@camerondi",
        avatar: "https://i.pravatar.cc/100?img=3"
    },
    {
        id: 4,
        text: "The best development experience I've had in years.",
        author: "@alexborm",
        avatar: "https://i.pravatar.cc/100?img=4"
    },
    {
        id: 5,
        text: "Incredible attention to detail in every component.",
        author: "@martina",
        avatar: "https://i.pravatar.cc/100?img=5"
    },
    {
        id: 6,
        text: "The support team is very responsive and helpful!",
        author: "@christin.ja",
        avatar: "https://i.pravatar.cc/100?img=6"
    },
    {
        id: 7,
        text: "This UI kit saved me countless hours of development.",
        author: "@michael.dev",
        avatar: "https://i.pravatar.cc/100?img=7"
    },
    {
        id: 8,
        text: "Perfect balance of flexibility and structure.",
        author: "@sarah.designer",
        avatar: "https://i.pravatar.cc/100?img=8"
    }
];

const TestimonialCard = ({ text, author, avatar, index }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-[#1C1C1C] rounded-full px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-3 w-[85%] sm:w-full sm:max-w-md ${index % 2 === 0 ? 'sm:mx-auto mr-auto' : 'sm:mx-auto ml-auto'}`}
        >
            <img src={avatar} alt={author} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0" />
            <div className="min-w-0">
                <p className="text-white text-xs sm:text-sm">{text}</p>
                <p className="text-[#8778e9] text-xs sm:text-sm mt-0.5 sm:mt-1">{author}</p>
            </div>
        </motion.div>
    );
};

const Testimonials = () => {
    return (
        <section className="py-12 sm:py-16 md:py-24 px-4 relative overflow-hidden">
            <div className="max-w-7xl mx-auto text-center mb-8 sm:mb-12 md:mb-16">
                <h3 className="font-michroma bg-gradient-to-r from-[#6a5acd] to-[#353332] bg-clip-text text-transparent text-sm sm:text-base mb-2 sm:mb-4">12K+ HAPPY CUSTOMERS</h3>
                <h2 className="text-black text-2xl sm:text-4xl md:text-5xl font-michroma">Users love Netronix</h2>
            </div>

            <div className="max-w-7xl mx-auto relative">
                <div className="flex flex-col gap-4 sm:gap-6">
                    {/* First Row - 3 cards */}
                    <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                        {testimonials.slice(0, 3).map((testimonial, index) => (
                            <TestimonialCard key={testimonial.id} {...testimonial} index={index} />
                        ))}
                    </div>

                    {/* Second Row - 2 cards */}
                    <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                        {testimonials.slice(3, 5).map((testimonial, index) => (
                            <TestimonialCard key={testimonial.id} {...testimonial} index={index + 3} />
                        ))}
                    </div>

                    {/* Third Row - 3 cards */}
                    <div className="flex flex-col sm:flex-row justify-center gap-4 sm:gap-6">
                        {testimonials.slice(5, 8).map((testimonial, index) => (
                            <TestimonialCard key={testimonial.id} {...testimonial} index={index + 5} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-8 sm:mt-12 text-center">
                <a href="#" className="bg-gradient-to-r from-[#6a5acd] to-[#353332] bg-clip-text text-transparent underline font-michroma text-xs sm:text-sm hover:text-black transition-colors">
                    Read All 2,482 Reviews
                </a>
            </div>
        </section>
    );
};

export default Testimonials; 