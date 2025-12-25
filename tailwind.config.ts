import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        e1: "var(--acg-shadow-e1)",
        e2: "var(--acg-shadow-e2)",
        e3: "var(--acg-shadow-e3)",
        e4: "var(--acg-shadow-e4)",
        e5: "var(--acg-shadow-e5)",
        e6: "var(--acg-shadow-e6)",
        e7: "var(--acg-shadow-e7)",
        e8: "var(--acg-shadow-e8)",
        e9: "var(--acg-shadow-e9)",
        e10: "var(--acg-shadow-e10)",
        e11: "var(--acg-shadow-e11)",
        e12: "var(--acg-shadow-e12)"
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px"
      },
      fontSize: {
        "phi-xs": ["var(--acg-text-phi-xs)", { lineHeight: "var(--acg-leading)" }],
        "phi-sm": ["var(--acg-text-phi-sm)", { lineHeight: "var(--acg-leading)" }],
        "phi-md": ["var(--acg-text-phi-md)", { lineHeight: "var(--acg-leading)" }],
        "phi-lg": ["var(--acg-text-phi-lg)", { lineHeight: "var(--acg-leading-tight)" }],
        "phi-xl": ["var(--acg-text-phi-xl)", { lineHeight: "var(--acg-leading-tight)" }],
        "phi-2xl": ["var(--acg-text-phi-2xl)", { lineHeight: "var(--acg-leading-tight)" }]
      },
      spacing: {
        grid: "var(--acg-grid-gap)",
        gutter: "var(--acg-grid-gutter)",
        "phi-1": "0.382rem",
        "phi-2": "0.618rem",
        "phi-3": "1rem",
        "phi-4": "1.618rem",
        "phi-5": "2.618rem",
        "phi-6": "4.236rem"
      },
      transitionTimingFunction: {
        smooth: "var(--ease-smooth)",
        standard: "var(--ease-standard)",
        spring: "var(--ease-spring)"
      },
      transitionDuration: {
        quick: "var(--dur-quick)",
        fast: "var(--dur-fast)",
        base: "var(--dur)",
        slow: "var(--dur-slow)"
      }
    }
  }
} satisfies Config;

