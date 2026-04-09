import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#f8fafc",
        steel: "#475569",
        line: "#dbe4ee",
        accent: "#0f766e",
        accentSoft: "#ccfbf1",
        warning: "#b45309",
        danger: "#b91c1c"
      },
      boxShadow: {
        panel: "0 12px 32px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

