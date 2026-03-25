import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gitam: {
          DEFAULT: 'rgb(var(--gitam) / <alpha-value>)',
          50: 'rgb(var(--gitam-50) / <alpha-value>)',
          100: 'rgb(var(--gitam-100) / <alpha-value>)',
          200: 'rgb(var(--gitam-200) / <alpha-value>)',
          300: 'rgb(var(--gitam-300) / <alpha-value>)',
          400: 'rgb(var(--gitam-400) / <alpha-value>)',
          500: 'rgb(var(--gitam-500) / <alpha-value>)',
          600: 'rgb(var(--gitam-600) / <alpha-value>)',
          700: 'rgb(var(--gitam-700) / <alpha-value>)',
          800: 'rgb(var(--gitam-800) / <alpha-value>)',
        },
        antique: {
          DEFAULT: 'rgb(var(--antique) / <alpha-value>)',
          50: 'rgb(var(--antique-50) / <alpha-value>)',
          100: 'rgb(var(--antique-100) / <alpha-value>)',
          200: 'rgb(var(--antique-200) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
export default config;
