import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

const testimonials = [
    {
        id: 1,
        text: "Netronix has the best selection of gaming laptops in Beirut. Their delivery was faster than expected, and the setup service was excellent!",
        author: "@ziad.khoury",
        avatar: "https://i.pravatar.cc/100?img=11"
    },
    {
        id: 2,
        text: "I've been buying all my tech from Netronix for a year now. Their customer service and product quality are unmatched in Lebanon.",
        author: "@maya.haddad",
        avatar: "https://i.pravatar.cc/100?img=5"
    },
    {
        id: 3,
        text: "Finding quality computer parts in Beirut used to be a challenge until I discovered Netronix. Their components are authentic and reasonably priced.",
        author: "@karim.nassar",
        avatar: "https://i.pravatar.cc/100?img=13"
    },
    {
        id: 4,
        text: "Bought my custom gaming PC from Netronix last month. Amazing build quality and the performance exceeds expectations. Worth every LBP!",
        author: "@farah.ibrahim",
        avatar: "https://i.pravatar.cc/100?img=9"
    },
    {
        id: 5,
        text: "As a graphic designer in Jounieh, I need reliable equipment. Netronix's monitors and peripherals have never let me down.",
        author: "@georges.abboud",
        avatar: "https://i.pravatar.cc/100?img=12"
    },
    {
        id: 6,
        text: "The technical support team at Netronix saved my business when our server crashed. They had us back up and running the same day!",
        author: "@nour.dagher",
        avatar: "https://i.pravatar.cc/100?img=6"
    },
    {
        id: 7,
        text: "My university recommended Netronix for student laptops, and they even gave us a special discount. Great service for students in Lebanon!",
        author: "@rami.khalil",
        avatar: "https://i.pravatar.cc/100?img=15"
    },
    {
        id: 8,
        text: "After comparing prices across Beirut, Netronix consistently offers the most competitive rates for authentic Apple products. Very satisfied!",
        author: "@layla.aoun",
        avatar: "https://i.pravatar.cc/100?img=10"
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


TestimonialCard.propTypes = {
    text: PropTypes.string.isRequired,
    author: PropTypes.string.isRequired,
    avatar: PropTypes.string,
    index: PropTypes.number,
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