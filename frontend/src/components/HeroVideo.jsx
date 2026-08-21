import { useContext, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

import { ShopContext } from '../context/shopContext';
import useReducedMotion from '../lib/useReducedMotion';

// FE-004 — the call to action pointed at a literal ObjectId.
//
// `/product/680262846be92b2511550a66` is a URL that works against exactly one
// database. Everywhere else the "View Details" button under the video led to a
// product page for a product that is not there.
//
// The video is unchanged in what it *shows* — same clip, same overlay, same
// play/pause control. Only the destination is data now: whichever product the
// catalog assigns to the `hero-video` slot. When no product claims it the
// button is not rendered, because a button that goes nowhere is worse than one
// that is absent (FE-014's territory, but this one is a consequence of the id).
//
// PERF-002 — how it *arrives* is what changed in Phase 4. The clip used to be
// `import videoSrc from '../assets/Videos/Razer AD.mp4'`, which made an 11.5 MB
// file a build asset: content-hashed into `dist/`, fetched from the
// application's own origin, with no poster, no compression pass, and a
// `loading="lazy"` attribute that does nothing at all on a `<video>` element.
//
// Now: 1280×720 two-pass VP9 (1.24 MB) and H.264 (1.42 MB) in `public/media/`
// — see `scripts/optimise-media.sh` for exactly how they were produced — a
// real poster frame from the clip itself, `preload="metadata"`, and an
// `IntersectionObserver` that does not attach a single `<source>` until the
// section is near the viewport. The homepage therefore pays for the poster
// (71 kB) and nothing else until a visitor scrolls to it.
//
// A11Y-001 — under `prefers-reduced-motion: reduce` the video does not
// autoplay and its sources are not attached at all until the visitor presses
// play. What they see instead is the poster, which is a frame of the clip, and
// a play control that works. That is WCAG 2.2.2 (Pause, Stop, Hide) satisfied
// by not starting rather than by offering a stop.

const POSTER = '/media/netronix-product-video-poster.jpg'
const SOURCES = [
    { src: '/media/netronix-product-video.webm', type: 'video/webm' },
    { src: '/media/netronix-product-video.mp4', type: 'video/mp4' },
]

const HeroVideo = () => {
    const reducedMotion = useReducedMotion();
    const { showcaseOne } = useContext(ShopContext);

    const containerRef = useRef(null);
    const videoRef = useRef(null);

    // Two gates, not one.
    //
    //   `near`   — the section is within a screen or so of the viewport, so the
    //              poster frame is worth fetching.
    //   `loaded` — the sources are attached and the clip itself is fetched.
    //
    // They are separate because the poster is 71 kB and the section sits far
    // below the fold: Lighthouse measured it as the third-largest resource on
    // the homepage's *initial* load, downloaded for a band nobody had scrolled
    // to. `poster` has no lazy-loading attribute — a `<video>` ignores
    // `loading` entirely, which is the other half of PERF-002 — so the only way
    // to defer it is not to set it yet.
    const [near, setNear] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const product = showcaseOne('hero-video');

    // Fetch the poster when the section gets close. This one runs whatever the
    // motion preference is: a still frame is not motion, and it is what the
    // reduced-motion visitor is shown instead of playback.
    useEffect(() => {
        if (near) return undefined;

        const node = containerRef.current;
        if (!node) return undefined;

        if (typeof IntersectionObserver !== 'function') {
            setNear(true);
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setNear(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '600px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [near]);

    // Attach the sources once the section is actually approaching — but never
    // on its own if the visitor asked for reduced motion, because loading it is
    // what leads to it playing.
    useEffect(() => {
        if (reducedMotion || loaded || !near) return undefined;

        const node = containerRef.current;
        if (!node) return undefined;

        if (typeof IntersectionObserver !== 'function') {
            // No observer (older browser, or a test environment without the
            // stub): fall back to loading it rather than to a dead player.
            setLoaded(true);
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setLoaded(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '300px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [reducedMotion, loaded, near]);

    // Autoplay is a consequence of the sources arriving, not a separate switch,
    // so a reduced-motion visitor who presses play gets ordinary playback.
    useEffect(() => {
        if (!loaded || reducedMotion) return;
        const video = videoRef.current;
        if (!video) return;
        const started = video.play?.();
        if (started && typeof started.catch === 'function') {
            // A browser that refuses autoplay leaves the poster and the play
            // control, which is a working state rather than an error.
            started.catch(() => setIsPlaying(false));
        }
        setIsPlaying(true);
    }, [loaded, reducedMotion]);

    const togglePlay = () => {
        if (!loaded) {
            // First press under reduced motion: attach the sources, and let the
            // effect below start playback once they are there.
            setNear(true);
            setLoaded(true);
            setIsPlaying(true);
            return;
        }
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying) {
            video.pause();
        } else {
            video.play?.()?.catch?.(() => { });
        }
        setIsPlaying(!isPlaying);
    };

    // Under reduced motion the first press has to start playback itself,
    // because the autoplay effect deliberately skips that case.
    useEffect(() => {
        if (!reducedMotion || !loaded || !isPlaying) return;
        videoRef.current?.play?.()?.catch?.(() => { });
    }, [reducedMotion, loaded, isPlaying]);

    return (
        <section className="w-full bg-black rounded-t-[30px]" aria-label="Featured product film">
            {/* Video Container */}
            <div ref={containerRef} className="relative max-h-[100vh] w-full overflow-hidden rounded-t-[30px]">
                <video
                    ref={videoRef}
                    data-testid="hero-video"
                    data-loaded={loaded ? 'true' : 'false'}
                    loop
                    muted
                    playsInline
                    poster={near ? POSTER : undefined}
                    preload="metadata"
                    width={1280}
                    height={720}
                    className="w-full h-full object-cover"
                    controls
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                >
                    {loaded && SOURCES.map((source) => (
                        <source key={source.src} src={source.src} type={source.type} />
                    ))}
                </video>

                {/* Content Overlay */}
                <div className="absolute inset-0 bg-black/30">
                    {/* Desktop: Bottom Left Content */}
                    <div className="hidden sm:block absolute bottom-12 md:bottom-16 left-8 md:left-20 max-w-sm md:max-w-xl">
                        <h2 className="text-2xl md:text-4xl font-michroma text-white mb-3 md:mb-4 leading-tight">
                            Razer Cobra Line – Precision Redefined
                        </h2>
                        <p className="text-base md:text-lg text-white/80 font-michroma mb-6 md:mb-8 leading-snug">
                            Experience next-level speed and control with cutting-edge technology.
                        </p>
                        {product && (
                            <motion.div whileHover={{ scale: 1.02 }} className="inline-block">
                                <Link
                                    to={`/product/${product._id}`}
                                    className="bg-white text-black font-michroma px-6 md:px-8 py-3 md:py-4 rounded-full inline-flex items-center gap-2 text-sm md:text-base fill-button fill-button-black-outline"
                                >
                                    View Details
                                    <svg aria-hidden="true" focusable="false" className="w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            </motion.div>
                        )}
                    </div>

                    {/* Mobile: Bottom Left Content */}
                    <div className="sm:hidden absolute bottom-4 left-4 max-w-[200px]">
                        <h2 className="text-sm font-michroma text-white mb-2 leading-tight">
                            Razer Cobra Line – Precision Redefined
                        </h2>
                        {product && (
                            <motion.div whileHover={{ scale: 1.02 }} className="inline-block">
                                <Link
                                    to={`/product/${product._id}`}
                                    className="bg-white text-black font-michroma px-5 py-2 rounded-full inline-flex items-center gap-1 text-xs fill-button fill-button-black-outline"
                                >
                                    View Details
                                    <svg aria-hidden="true" focusable="false" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </Link>
                            </motion.div>
                        )}
                    </div>
                </div>

                {/* Play/Pause Button */}
                <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause the product film' : 'Play the product film'}
                    className="absolute bottom-4 sm:bottom-6 md:bottom-8 right-4 sm:right-6 md:right-8 w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-white rounded-full flex items-center justify-center hover:bg-white/90 transition-colors"
                >
                    {isPlaying ? (
                        <svg aria-hidden="true" focusable="false" className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7 0a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg aria-hidden="true" focusable="false" className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
            </div>
        </section>
    );
};

export default HeroVideo;
