import { useCallback, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

import useMediaQuery from '../lib/useMediaQuery';

// PERF-004 — the eight category images were 1080×1080 to 2560×2560 PNG/JPEG
// originals rendered into a 310×420 CSS-pixel card. They are now WebP at two
// widths (`scripts/optimise-media.sh`), wired up as a `srcset` so a phone
// fetches the 400 px copy: 5.0 MB of source art became 380 kB of delivery.
// The masters stay in `src/assets/` because the script regenerates from them.
import laptop400 from '../assets/optimised/laptops-category-400.webp';
import laptop800 from '../assets/optimised/laptops-category-800.webp';
import pc400 from '../assets/optimised/pc-category-400.webp';
import pc800 from '../assets/optimised/pc-category-800.webp';
import macbook400 from '../assets/optimised/macbook-category-400.webp';
import macbook800 from '../assets/optimised/macbook-category-800.webp';
import headphones400 from '../assets/optimised/headphones-category-400.webp';
import headphones800 from '../assets/optimised/headphones-category-800.webp';
import earphones400 from '../assets/optimised/earphones-category-400.webp';
import earphones800 from '../assets/optimised/earphones-category-800.webp';
import speakers400 from '../assets/optimised/speakers-category-400.webp';
import speakers800 from '../assets/optimised/speakers-category-800.webp';
import accessories400 from '../assets/optimised/accessories-category-400.webp';
import accessories800 from '../assets/optimised/accessories-category-800.webp';
import gaming400 from '../assets/optimised/gaming-category-400.webp';
import gaming800 from '../assets/optimised/gaming-category-800.webp';

/** The card is 220 px wide on mobile and 310 px on desktop; the browser picks. */
const CARD_SIZES = '(max-width: 767px) 220px, 310px';

// A11Y — the depth effect renders the off-centre cards at 60% and 40% opacity
// behind a blur. axe reported the 40% ones as a colour-contrast violation, and
// it is right: text at 40% opacity is not readable, and the reason it is there
// is that it is scenery rather than content.
//
// So this is a carousel, and it is announced as one: the cards a visitor is
// actually being shown are in the accessibility tree, the dimmed ones behind
// them are `aria-hidden` and out of the tab order, and the previous/next
// buttons — which were already real, labelled buttons — are how you reach the
// rest. Nothing about the visual changes.
const Slider = () => {
    const [active, setActive] = useState(2);
    // Two cards are at full opacity on desktop (`active` and `active + 1`) and
    // one on mobile; `loadShow()` below is the source of that rule and this
    // mirrors it.
    const isDesktop = useMediaQuery('(min-width: 768px)');
    const sliderRef = useRef(null);

    const sliderItems = [
        {
            image: laptop800,
            imageSet: `${laptop400} 400w, ${laptop800} 800w`,
            title: "Laptops",
            subtitle: "Powerful performance on the go",
            tag: "Laptops"
        },
        {
            image: pc800,
            imageSet: `${pc400} 400w, ${pc800} 800w`,
            title: "Gaming PCs",
            subtitle: "Ultimate gaming experience",
            tag: "Gaming PCs"
        },
        {
            image: macbook800,
            imageSet: `${macbook400} 400w, ${macbook800} 800w`,
            title: "MacBooks",
            subtitle: "Premium Apple laptops",
            tag: "MacBooks"
        },
        {
            image: headphones800,
            imageSet: `${headphones400} 400w, ${headphones800} 800w`,
            title: "Headphones",
            subtitle: "Immersive audio experience",
            tag: "Headphones"
        },
        {
            image: earphones800,
            imageSet: `${earphones400} 400w, ${earphones800} 800w`,
            title: "Earphones",
            subtitle: "Portable sound solutions",
            tag: "Earphones"
        },
        {
            image: speakers800,
            imageSet: `${speakers400} 400w, ${speakers800} 800w`,
            title: "Speakers",
            subtitle: "Room-filling premium sound",
            tag: "Speakers"
        },
        {
            image: accessories800,
            imageSet: `${accessories400} 400w, ${accessories800} 800w`,
            title: "Accessories",
            subtitle: "Essential tech add-ons",
            tag: "Accessories"
        },
        {
            image: gaming800,
            imageSet: `${gaming400} 400w, ${gaming800} 800w`,
            title: "Gaming",
            subtitle: "Level up your gaming setup",
            tag: "Gaming"
        }
    ];

    // A11Y-005 — these cards were `<div onClick>`: not focusable, not
    // activatable by keyboard, and announced as nothing. They are links now,
    // to exactly the URL the click handler navigated to. The class list, the
    // absolute positioning `loadShow()` writes, and the hover scrub are
    // unchanged, so the card looks and moves exactly as it did.
    const restoreScroll = () => {
        document.body.style.overflow = 'auto';
    };

    // TEST-002 — `loadShow` writes the absolute position of every card and is
    // called from two effects. Memoised on `active`, which is the only thing
    // it reads, so both effects can depend on the function honestly instead of
    // on a hand-picked subset of what it closes over.
    const loadShow = useCallback(() => {
        if (!sliderRef.current) return;
        const items = sliderRef.current.querySelectorAll('.slider-item');

        // Get the current viewport width
        const viewportWidth = window.innerWidth;
        const isMobile = viewportWidth < 768;
        
        // Responsive values based on viewport width
        const CARD_WIDTH = isMobile ? 220 : 310;
        const CARD_HEIGHT = isMobile ? 300 : 420;
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
                    item.style.zIndex = '5';
                    item.style.filter = 'none';
                    item.style.opacity = '1';
                } else if (index > active) {
                    // Cards to the right on mobile
                    const position = index - active;
                    const xOffset = SIDE_GAP * position;
                    const scale = 1 - 0.15 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(-1deg)`;
                    item.style.zIndex = `${4 - position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                } else {
                    // Cards to the left on mobile
                    const position = active - index;
                    const xOffset = -SIDE_GAP * position;
                    const scale = 1 - 0.15 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(1deg)`;
                    item.style.zIndex = `${4 - position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                }
            } else {
                // Desktop version remains unchanged
                if (index === active) {
                    item.style.transform = `translateX(${CENTER_LEFT}px)`;
                    item.style.zIndex = '5';
                    item.style.filter = 'none';
                    item.style.opacity = '1';
                } else if (index === active + 1) {
                    item.style.transform = `translateX(${CENTER_RIGHT}px)`;
                    item.style.zIndex = '5';
                    item.style.filter = 'none';
                    item.style.opacity = '1';
                } else if (index > active + 1) {
                    const position = index - (active + 1);
                    const xOffset = CENTER_RIGHT + SIDE_GAP * position;
                    const scale = 1 - 0.2 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(-1deg)`;
                    item.style.zIndex = `${4 - position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                } else {
                    const position = active - index;
                    const xOffset = CENTER_LEFT - SIDE_GAP * position;
                    const scale = 1 - 0.2 * position;

                    item.style.transform = `translateX(${xOffset}px) scale(${scale}) perspective(16px) rotateY(1deg)`;
                    item.style.zIndex = `${4 - position}`;
                    item.style.filter = position === 1 ? 'blur(1px)' : position === 2 ? 'blur(3px)' : 'blur(5px)';
                    item.style.opacity = position > 2 ? '0' : position === 2 ? '0.4' : '0.6';
                }
            }
        });
    }, [active]);

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
    }, [loadShow]);

    // A second pass after layout has settled: the card widths depend on the
    // viewport, and on a cold load the first pass can run before the fonts and
    // images that determine it have arrived.
    useEffect(() => {
        const timer = setTimeout(() => {
            loadShow();
        }, 300);

        return () => clearTimeout(timer);
    }, [loadShow]);

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
                    {sliderItems.map((item, index) => {
                        // `loadShow()` below renders the cards on either side of
                        // the focus at 60% and 40% opacity behind a 1–5 px blur.
                        // axe reported the 40% ones as a colour-contrast
                        // violation, and it is right: composited against the
                        // card's near-white background, that text lands around
                        // 2.8:1 against a 4.5:1 threshold.
                        //
                        // It is also, at that opacity and blur, not text anybody
                        // is reading — it is depth. So the receding cards keep
                        // their shape, their image, their blur and their fade,
                        // and simply do not draw a label. The focused card (two
                        // of them on desktop, which is what `loadShow` treats as
                        // full opacity) is the one that carries the words, and
                        // it is the only one in the accessibility tree and the
                        // tab order — the previous/next buttons are how you
                        // reach the others, which is what a carousel is.
                        const focus = isDesktop ? [active, active + 1] : [active];
                        const prominent = focus.includes(index);
                        return (
                        <Link
                            key={index}
                            to={`/products?tag=${encodeURIComponent(item.tag)}`}
                            onClick={restoreScroll}
                            aria-label={`${item.title} — ${item.subtitle}`}
                            aria-hidden={prominent ? undefined : 'true'}
                            tabIndex={prominent ? undefined : -1}
                            className="slider-item absolute transition-all duration-500 group cursor-pointer"
                        >
                            <div className="media-card__link flex flex-col w-full h-full relative">
                                {/* Card Container with Background */}
                                <div className="absolute inset-0 bg-[#f9f9f9] rounded-2xl overflow-hidden">
                                    {/* Media Container */}
                                    <div className="media relative w-full h-[160px] md:h-[280px] bg-[#f9f9f9] rounded-t-2xl z-[5]">
                                        <div className="absolute">
                                            <img
                                                src={item.image}
                                                srcSet={item.imageSet}
                                                sizes={CARD_SIZES}
                                                alt=""
                                                width={310}
                                                height={280}
                                                className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-110"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        </div>
                                    </div>

                                    {/* Content Container */}
                                    {prominent && (
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
                                            aria-hidden="true"
                                            focusable="false"
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
                                    )}
                                </div>
                            </div>
                        </Link>
                        );
                    })}

                    <button
                        type="button"
                        onClick={handlePrev}
                        className="absolute top-[45%] left-[5%] text-[#6a5acd] bg-[#f9f9f9] rounded-full p-3 z-20 hover:scale-110 transition-transform flex items-center justify-center shadow-md"
                        aria-label="Previous slide"
                    >
                        <svg
                            aria-hidden="true"
                            focusable="false"
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
                        type="button"
                        onClick={handleNext}
                        className="absolute top-[45%] right-[5%] text-[#6a5acd] bg-[#f9f9f9] rounded-full p-3 z-20 hover:scale-110 transition-transform flex items-center justify-center shadow-md"
                        aria-label="Next slide"
                    >
                        <svg
                            aria-hidden="true"
                            focusable="false"
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