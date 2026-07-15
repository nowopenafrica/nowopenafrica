/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
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
