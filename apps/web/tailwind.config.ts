import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { brand: { 50: "#eef6ff", 100: "#d9eaff", 500: "#2f7df6", 600: "#1d63d8", 700: "#184fae" } },
      fontFamily: { sans: ["var(--font-khmer)", "var(--font-latin)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
