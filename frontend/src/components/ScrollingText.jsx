import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import useReducedMotion from '../lib/useReducedMotion';

// FE-015 / PERF-007 — this component re-rendered sixty times a second.
//
// The `requestAnimationFrame` loop called `setBasePosition(position)` on every
// frame, and `basePosition` was listed in the effect's dependency array. So
// each frame: set state → re-render → tear the effect down → cancel the rAF →
// remove the scroll listener → re-add the scroll listener → schedule a new rAF.
// Sixty times a second, for a value that was never read during render. The
// same applied to `scrollDirection` and `lastScrollTop`.
//
// Everything that was state and is only read by the animation is a ref now, so
// the effect runs once and the loop keeps the same identity for the lifetime of
// the component. The `style.transform` write it already did is the only thing
// that ever needed to happen per frame, and it still does — the interaction
// (text drifts left, accelerates when you scroll down, reverses when you scroll
// up) is unchanged.
//
// A11Y-001 — under `prefers-reduced-motion: reduce` the loop is never started
// and no scroll listener is attached. The text is still there, still in the
// same place, simply not moving: continuous motion is precisely what the
// preference asks to stop (WCAG 2.2.2).
//
// PERF-003 — two further things the loop used to do sixty times a second.
//
//   * **It read `scrollWidth` every frame**, immediately after writing
//     `style.transform` on the same element. That is a write followed by a read
//     of a layout property: the browser has to flush layout synchronously
//     before it can answer, every frame, on an element twenty segments of
//     `10vw` text wide. A CPU profile of the homepage at 4× throttling put
//     268 ms of self time in this one function and most of the rest of the
//     frame budget in the browser's own layout. The width only changes when
//     the element is re-laid-out, so it is measured once and re-measured on
//     resize.
//   * **It ran while the section was six thousand pixels below the fold.** The
//     text drifts for nobody there, and every frame of it competed with the
//     first paint. An `IntersectionObserver` pauses the loop while the strip is
//     off-screen and resumes it when it approaches.
//
// The pause defaults to **running**, not to paused: if there is no
// `IntersectionObserver` — an older browser, a test environment without the
// stub — the animation behaves exactly as it did before. A missing observer
// can only fail towards the old behaviour, never towards a dead strip.

const SEGMENTS = 20;

const ScrollingText = ({ text = 'Premium tech · Exceptional performance', speed = 2.5 }) => {
    const trackRef = useRef(null);
    const reducedMotion = useReducedMotion();

    // Animation state, deliberately outside React.
    const position = useRef(0);
    const direction = useRef(null);
    const lastScrollTop = useRef(0);
    const directionTimer = useRef(null);
    // The width of one repeated segment, measured rather than re-read.
    const segmentWidth = useRef(0);

    useEffect(() => {
        if (reducedMotion) {
            // Park it at the start rather than wherever the last frame left it.
            position.current = 0;
            if (trackRef.current) trackRef.current.style.transform = 'translateX(0px)';
            return undefined;
        }

        let frame = null;
        // Running unless an observer has said the strip is off-screen.
        let onScreen = true;

        const measure = () => {
            segmentWidth.current = (trackRef.current?.scrollWidth ?? 0) / SEGMENTS;
        };
        measure();

        const animate = () => {
            let next = position.current - speed;

            if (direction.current === 'down') next -= speed * 2;
            else if (direction.current === 'up') next += speed * 3;

            // Seamless wrap: one repeated segment of the track's own width.
            const width = segmentWidth.current;
            if (width > 0 && next <= -width) next += width;

            position.current = next;
            if (trackRef.current) {
                trackRef.current.style.transform = `translateX(${next}px)`;
            }
            frame = requestAnimationFrame(animate);
        };

        const start = () => {
            if (frame === null) frame = requestAnimationFrame(animate);
        };
        const stop = () => {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
        };

        start();

        const handleScroll = () => {
            const current = window.pageYOffset || document.documentElement.scrollTop;
            direction.current = current > lastScrollTop.current ? 'down' : 'up';
            lastScrollTop.current = current;

            if (directionTimer.current) clearTimeout(directionTimer.current);
            directionTimer.current = setTimeout(() => { direction.current = null; }, 300);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        // The measured width is only wrong if the element is re-laid-out, which
        // on this strip means the viewport changed.
        window.addEventListener('resize', measure, { passive: true });

        let observer = null;
        if (typeof IntersectionObserver === 'function' && trackRef.current) {
            observer = new IntersectionObserver(
                (entries) => {
                    onScreen = entries.some((entry) => entry.isIntersecting);
                    if (onScreen) { measure(); start(); } else { stop(); }
                },
                // A margin, so it is already moving by the time it is seen.
                { rootMargin: '200px' },
            );
            observer.observe(trackRef.current);
        }

        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', measure);
            observer?.disconnect();
            stop();
            if (directionTimer.current) clearTimeout(directionTimer.current);
        };
    }, [speed, reducedMotion]);

    const repeatedText = Array(SEGMENTS).fill(text).join(' ');

    return (
        <div className="w-full overflow-hidden py-4 md:py-8">
            <div
                ref={trackRef}
                data-testid="scrolling-text-track"
                data-animating={reducedMotion ? 'false' : 'true'}
                className="whitespace-nowrap text-[10vw] font-michroma text-transparent inline-block"
                style={{
                    WebkitTextStroke: '1px #000',
                    textStroke: '1px #000',
                }}
            >
                {repeatedText}
            </div>
        </div>
    );
};

ScrollingText.propTypes = {
    text: PropTypes.string,
    speed: PropTypes.number,
};

export default ScrollingText;
