/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff0f0',
          100: '#ffe0e0',
          200: '#ffbdbd',
          300: '#ff8f8f',
          400: '#ff5252',
          500: '#ff2020',
          600: '#CC0000',
          700: '#a30000',
          800: '#870000',
          900: '#720000',
          950: '#3d0000',
        },
        surface: {
          DEFAULT: '#ffffff',
          soft:    '#f8f9fa',
          muted:   '#f1f3f4',
          border:  '#e5e7eb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:   '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.12)',
        modal:  '0 20px 60px -10px rgb(0 0 0 / 0.25)',
      },
      animation: {
        'slide-up':    'slideUp 0.3s ease-out',
        'fade-in':     'fadeIn 0.25s ease-out',
        'bounce-once': 'bounceOnce 0.5s ease-out',
        'pulse-ring':  'pulseRing 1.5s ease infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounceOnce: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(204, 0, 0, 0.5)' },
          '70%': { transform: 'scale(1)', boxShadow: '0 0 0 12px rgba(204, 0, 0, 0)' },
          '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(204, 0, 0, 0)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
