import PropTypes from 'prop-types';

// PERF-009 — the Netronix wordmark was hotlinked from a Webflow CDN in three
// places: the storefront navbar, the storefront footer, and the admin sidebar.
// If that asset ever moved, Netronix would lose its logo everywhere at once,
// including in the console an operator uses to fix it. It was also a
// render-blocking third-party request on every single page.
//
// It is drawn locally now. The original PNG could not be downloaded — this
// phase contacts no external host — so the wordmark is set rather than traced:
// inline SVG text in Michroma, the brand's own display face, which the page has
// already loaded. `textLength` with `lengthAdjust="spacingAndGlyphs"` pins the
// mark to the same width whatever font actually resolves, so a cold cache or a
// blocked font file changes nothing about the layout.
//
// `fill="currentColor"` is what lets the footer render it white by setting a
// text colour, where the old markup used `brightness-0 invert` on a raster.

const BrandLogo = ({ className = '', title = 'Netronix' }) => (
    <svg
        viewBox="0 0 220 30"
        role="img"
        aria-label={title}
        className={className}
        style={{ display: 'block' }}
    >
        <text
            x="0"
            y="23"
            textLength="220"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="Michroma, Outfit, system-ui, sans-serif"
            fontSize="24"
            letterSpacing="1"
            fill="currentColor"
        >
            NETRONIX
        </text>
    </svg>
);

BrandLogo.propTypes = {
    className: PropTypes.string,
    title: PropTypes.string,
};

export default BrandLogo;
