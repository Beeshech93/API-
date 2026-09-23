import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050a14",
        navy: { DEFAULT: "#0a1628", 800: "#0f2140", 700: "#152b52" },
        electric: { DEFAULT: "#2f6bff", 600: "#1f57e6", 100: "#e6eeff" },
      },
    },
  },
  plugins: [],
};

export default config;
