import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          border: "hsl(var(--info-border))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "mascot-bounce": {
          // Heavy creature jump with squash and stretch
          "0%": { transform: "translateY(0) scaleY(1) scaleX(1)" },
          // Anticipation squash before jump
          "10%": { transform: "translateY(2px) scaleY(0.85) scaleX(1.15)" },
          // Launch up with stretch
          "30%": { transform: "translateY(-12px) scaleY(1.1) scaleX(0.9)" },
          // Peak of jump
          "45%": { transform: "translateY(-14px) scaleY(1.05) scaleX(0.95)" },
          // Coming down
          "60%": { transform: "translateY(-4px) scaleY(1.1) scaleX(0.9)" },
          // Heavy landing squash
          "75%": { transform: "translateY(2px) scaleY(0.8) scaleX(1.2)" },
          // Recovery bounce
          "85%": { transform: "translateY(-3px) scaleY(1.05) scaleX(0.95)" },
          // Settle
          "92%": { transform: "translateY(1px) scaleY(0.95) scaleX(1.05)" },
          "100%": { transform: "translateY(0) scaleY(1) scaleX(1)" },
        },
      },
      animation: {
        "mascot-bounce": "mascot-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};

export default config;
