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
        spartan: ["League Spartan", "sans-serif"],
        poppins: ["Poppins", "sans-serif"],
      }
    },
  },
  plugins: [],
}
