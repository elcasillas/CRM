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
        // Legacy brand palette (blue) — kept for backward compat during migration
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
        // CRM design system palette (teal)
        primary: {
          DEFAULT: '#00ADB1',
          hover:   '#00989C',
          light:   '#33C3C7',
          bg:      '#E6F7F8',
          selected:'#D2F0F2',
        },
        accent: {
          DEFAULT: '#FFC857',
          hover:   '#E6B94F',
        },
        danger:  '#B1005A',
        success: '#2ECC71',
        warning: '#F39C12',
        crm: {
          bg:     '#F8FBFB',
          border: '#E3EAEA',
          text:   '#1F2A2B',
          muted:  '#5F7C7D',
        },
      },
    },
  },
  plugins: [],
}

export default config
