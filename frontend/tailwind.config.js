/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#748096",
        canvas: "#f5f7fb",
        brand: {
          50: "#eff3ff",
          100: "#dce5ff",
          500: "#526fe5",
          600: "#405bd0",
          700: "#344bb0",
          900: "#202e68",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Manrope", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 10px rgba(27, 39, 68, 0.035), 0 1px 2px rgba(27, 39, 68, 0.025)",
        floating: "0 16px 48px rgba(29, 42, 75, 0.14)",
      },
    },
  },
  plugins: [],
};
