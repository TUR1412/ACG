import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        xl: "16px",
        "2xl": "20px"
      }
    }
  }
} satisfies Config;

