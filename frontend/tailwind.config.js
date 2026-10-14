/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#DA7500",
          coral: "#FF6740",
        },
        dark: {
          bg: "#0F0F11",
          card: "#18181C",
          border: "#2A2A32",
          text: "#E4E4E7",
          sub: "#A1A1AA",
        }
      },
      fontFamily: {
        spartan: ["'Be Vietnam Pro'", "Inter", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
        poppins: ["Inter", "'Be Vietnam Pro'", "-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"],
        vietnam: ["'Be Vietnam Pro'", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      }
    },
  },
  plugins: [],
}
