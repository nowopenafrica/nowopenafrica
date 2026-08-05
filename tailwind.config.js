/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Fluid heading scale: clamp(mobile-min, fluid, desktop-max). The max
      // is the reduced "web" size from before; the min is noticeably
      // smaller so titles look cute/compact on phones instead of just
      // scaling down 1:1 with everything else. Same class works at every
      // breakpoint — no md:/lg: overrides needed. Body sizes are untouched.
      fontSize: {
        '2xl': ['clamp(1.05rem, 1rem + 0.9vw, 1.4rem)', { lineHeight: '1.5' }],
        '3xl': ['clamp(1.2rem, 1.15rem + 1.1vw, 1.7rem)', { lineHeight: '1.3' }],
        '4xl': ['clamp(1.35rem, 1.3rem + 1.3vw, 2rem)', { lineHeight: '1.2' }],
        '5xl': ['clamp(1.9rem, 1.4rem + 2.6vw, 2.6rem)', { lineHeight: '1.12' }],
        '6xl': ['clamp(2.1rem, 1.7rem + 3.2vw, 3.2rem)', { lineHeight: '1.1' }],
      },
      fontFamily: {
        // Coolvetica is self-hosted via @font-face in index.css (see the
        // comment there) so it renders identically for every visitor —
        // system-ui/sans-serif only kick in for the instant before the
        // webfont finishes loading, not as a permanent substitute.
        'sans': ['Coolvetica', 'system-ui', 'sans-serif'],
        'coolvetica': ['Coolvetica', 'system-ui', 'sans-serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            fontFamily: '"Coolvetica", system-ui, sans-serif',
          },
        },
      },
    },
  },
  plugins: [],
};
