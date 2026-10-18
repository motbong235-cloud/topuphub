import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bce0ff",
          500: "#1d6adf",
          600: "#1d63d8",
          700: "#184fae",
          900: "#082044",
        },
      },
      fontFamily: {
        sans: ["var(--font-khmer)", "var(--font-latin)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 8px 28px -12px rgba(8, 32, 68, 0.25)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
};
export default config;
