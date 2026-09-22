import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0b1e3d",
        lime: "#a6e22e",
      },
    },
  },
  plugins: [],
};

export default config;
