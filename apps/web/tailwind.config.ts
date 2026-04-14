import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1530",
        mist: "#f3f9ff",
        steel: "#64748b",
        line: "#d8e4f2",
        accent: "#1cc7d8",
        accentSoft: "#dffcff",
        warning: "#b45309",
        danger: "#b91c1c",
        brandIndigo: "#2a2d7c",
        brandNavy: "#081120"
      },
      boxShadow: {
        panel: "0 28px 90px rgba(4, 14, 30, 0.2)"
      }
    }
  },
  plugins: []
};

export default config;
