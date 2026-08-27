/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'michroma': ['Michroma', 'sans-serif'],
      },
      animation: {
        'marquee-left': 'marquee-left 25s linear infinite',
        'marquee-right': 'marquee-right 25s linear infinite',
        'plate-sheen': 'plate-sheen 1.4s ease-in-out infinite',
      },
      colors:{
        statepurp: '#6a5acd',
        // The catalog's editorial palette. The homepage is white-on-white with
        // #f9f9f9 plates; these are the same idea pitched a shade warmer, so a
        // product photograph sits on a surface rather than on a void. Named by
        // role rather than by hue, because the whole point of the redesign is
        // that the accent is used once and everything else is paper and ink.
        ink: {
          DEFAULT: '#121214',   // headings, prices, product names — 18.1:1 on paper
          60: '#5b5b61',        // secondary copy — 6.5:1
          // Eyebrows, meta and spec labels. This was `#8e8e95`, which is the
          // grey the design wants and measures 3.1:1 on paper — axe flagged
          // twelve nodes on the product page alone. Everything it is used for
          // is small text, so 4.5:1 is the bar, not 3:1. `#6c6c73` clears it on
          // all three surfaces the catalog paints (paper 5.0, plate 4.6,
          // white 5.2) and is the lightest value that does.
          40: '#6c6c73',
        },
        paper: '#fbfbfa',       // the page canvas. NOT gray-50, which is blue.
        // The surface a product image is painted on, and it is white for a
        // reason that is about the data rather than the design. The live
        // catalog's photography comes from Cloudinary and from vendor CDNs, and
        // it is not consistent: some assets are cut out on transparency, most
        // are shot on white, one is on black. A warm plate (this was #f2f1ee)
        // renders every white-background photograph as a hard white rectangle
        // floating on it — five of eight sampled live products. White absorbs
        // them, and a cut-out sits on white perfectly well, so the only tile
        // that still shows a box is the one whose source asset has a black
        // background. Against #fbfbfa paper a white plate still reads as a
        // tile, and the hairline under the price does the rest.
        plate: '#ffffff',
        // The warm grey the plate used to be. Still the right colour for a
        // surface that is *not* holding a photograph: loading skeletons, a
        // disabled control, a menu row under the pointer.
        wash: '#f2f1ee',
        rule: '#e5e3de',        // hairlines — the only "border" the catalog has
      },
      keyframes: {
        'marquee-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-right': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        // The skeleton's breath. Opacity only: a moving gradient on twelve
        // tiles at once is a compositing cost paid while the page is still
        // waiting on the network, which is the worst possible moment for it.
        'plate-sheen': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
}
