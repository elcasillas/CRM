import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          900: '#081B33',
          800: '#0D2B4E',
          700: '#0F3460',
          600: '#1565C0',
          500: '#1976D2',
          400: '#42A5F5',
          300: '#90CAF9',
          200: '#BFDBFE',
          100: '#DBEAFE',
          50:  '#EFF6FF',
        },
      },
    },
  },
  plugins: [],
}

export default config
