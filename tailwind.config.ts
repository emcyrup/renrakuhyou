import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e5ff',
          500: '#3b66d4',
          600: '#2f52b0',
          700: '#26428f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
