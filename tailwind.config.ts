import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        spartan: {
          green: "#18453B",
          "green-light": "#2E6B58",
          "green-dark": "#0D2B24",
        },
      },
    },
  },
  plugins: [],
};

export default config;
