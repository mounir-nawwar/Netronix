import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

import useReducedMotion from '../lib/useReducedMotion';

// PERF-001 — three 3D loading mechanisms lived in this one component and only
// the third rendered anything:
//
//   1. `import Spline from '@splinetool/react-spline'`, referenced by no JSX,
//      which nonetheless made Vite bundle the whole runtime — physics
//      (1,988 kB raw / 723 kB gzip), opentype, ui, process, boolean, navmesh,
//      howler, gaussian-splat-compression.
//   2. An injected `unpkg.com/@splinetool/viewer` module script, with no
//      `<spline-viewer>` element anywhere to consume it.
//   3. The `<iframe>` below, which is what visitors actually see.
//
// 1 and 2 are gone, along with the tracked `scene.splinecode` that none of the
// three loaded. **The hero is untouched.** It was an iframe, it stays an
// iframe, and an ordinary-motion visitor sees exactly what they saw before.
//
// A11Y-001 / A11Y-006 — what *is* new: the frame has a title (a screen reader
// announced an unlabelled frame filling the viewport), `frameborder` is the
// React prop `frameBorder`, and a visitor who has asked for reduced motion
// gets the static panel below instead. That is not a blank section: it is the
// same headline, the same copy, the same call to action, on the brand gradient
// — and the continuously animating third-party scene is never requested at
// all, which is the point of the preference.
//
// The "Shop Now" href is still `#`. It is one of the thirteen dead
// interactions in FE-014 / PORT-002, and resolving those is Phase 5's job, not
// this one's.

const HEADLINE = 'Next-Gen Tech, Delivered.'
const SUBHEAD =
    'Your gateway to the latest and greatest in computers, accessories, and gaming gear. ' +
    'Upgrade your setup with Netronix—where innovation meets performance.'

const HeroContent = ({ animated }) => (
    <div
        className="absolute z-10 md:top-1/3 md:left-[10vw] md:max-w-[40vw]
                  top-[10%] left-0 w-full px-6 md:px-0 text-center md:text-left"
        style={
            animated
                ? {
                    opacity: 0,
                    transform: 'translateX(-500px)',
                    animation: 'slideInFromLeft 4s ease-in-out forwards',
                }
                : undefined
        }
    >
        {animated && (
            <style>
                {`
            @media (max-width: 768px) {
              .hero-container {
                transform: none !important;
                animation: none !important;
                opacity: 1 !important;
              }
            }
          `}
            </style>
        )}
        <div className="hero-container">
            <h1 className="text-[28px] md:text-[54px] mt-[55px] mb-[20px] md:mb-[46px] font-michroma md:leading-[44px] leading-tight text-[#333]">
                {HEADLINE}
            </h1>
            <p className="text-[14px] md:text-[20px] mx-auto md:mx-0 max-w-[85%] md:max-w-[28vw] leading-[20px] md:leading-[25px] font-michroma text-[#333]">
                {SUBHEAD}
            </p>
            <Link
                to="#"
                className="hidden md:inline-block mt-[25px] px-[20px] py-[15px] bg-[#6a5acd] text-[#f4f4f4] text-[14px] leading-[20px] rounded-lg font-michroma fill-button fill-button-hero"
            >
                Shop Now
            </Link>
        </div>
    </div>
)

HeroContent.propTypes = {
    animated: PropTypes.bool,
}

const Hero = () => {
    const reducedMotion = useReducedMotion();
    const [contentVisible, setContentVisible] = useState(false);

    // Only the iframe path waits for a load event, because only the iframe path
    // has one. The static hero has its text on the first paint.
    const handleSplineLoad = () => setContentVisible(true);

    if (reducedMotion) {
        return (
            <div
                className="relative w-full h-screen overflow-hidden max-w-[100vw] max-h-[100vh]"
                data-testid="hero-static"
            >
                <div
                    className="absolute inset-0 w-full h-full"
                    style={{
                        background:
                            'radial-gradient(120% 90% at 78% 30%, #cfc9f5 0%, #ece9fb 42%, #f7f7fb 100%)',
                    }}
                />
                <HeroContent animated={false} />
            </div>
        );
    }

    return (
        <div className="relative w-full h-screen overflow-hidden max-w-[100vw] max-h-[100vh]">
            {/* Spline 3D Scene */}
            <div className="absolute inset-0 w-full h-full">
                <iframe
                    title="Netronix interactive 3D robot scene"
                    src='https://my.spline.design/nexbotrobotcharacterconcept-98ea87efdaff8e9988041f9b62305dbe/?logo=0'
                    frameBorder='0'
                    width='100%'
                    height='100%'
                    onLoad={handleSplineLoad}
                ></iframe>
            </div>

            {/* Hero Text */}
            {contentVisible && <HeroContent animated />}
        </div>
    );
};

export default Hero;
