import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // White + green theme. `navy` is the deep forest green used for
        // headings and code blocks; `brand` is the action green.
        ink: "#062016",
        navy: { DEFAULT: "#0b3d2a", 800: "#0f4d35", 700: "#14603f" },
        brand: { DEFAULT: "#16a34a", 600: "#15803d", 100: "#dcfce7", 50: "#f0fdf4" },
      },
    },
  },
  plugins: [],
};

export default config;
