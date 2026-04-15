/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          500: "#4f6bf6",
          600: "#3b54d9",
          700: "#2f42ad",
        },
      },
    },
  },
  plugins: [],
};
