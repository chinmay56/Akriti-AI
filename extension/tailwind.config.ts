import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./popup.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
