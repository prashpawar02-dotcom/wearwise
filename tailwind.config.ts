import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1280px" } },
    extend: {
      colors: {
        // Semantic tokens (HSL vars) — used across existing screens
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // ---- WearWise brand palette (exact design-system hex) ----
        // Surfaces
        ivory: "#F5F1EA",
        stone: "#EAE3D7",
        bone: "#FBF8F3",
        paper: "#FFFEFB",
        // Text
        charcoal: "#1C1A17",
        graphite: "#6B655C",
        mist: "#A39E94",
        // Accents
        plum: { DEFAULT: "#4A2C3D", soft: "#6E4B5E" },
        champagne: "#B8915A",
        sage: "#8AA17C",
        cobalt: "#3A4E7A",
        terracotta: "#C77A5A",
        lavender: "#C4BBD4",
        // Back-compat accents still referenced by older screens
        gold: "hsl(var(--brand-gold))",
        rose: "hsl(var(--brand-rose))",
      },
      borderColor: {
        hairline: "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // WearWise scale
        "ww-xs": "6px",
        "ww-sm": "10px",
        "ww-md": "16px",
        "ww-lg": "22px",
        "ww-xl": "28px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "Times New Roman", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        eyebrow: "0.16em",
      },
      boxShadow: {
        "ww-xs": "0 1px 2px rgba(28,26,23,0.04)",
        "ww-sm": "0 2px 8px rgba(28,26,23,0.04), 0 1px 2px rgba(28,26,23,0.04)",
        "ww-md": "0 8px 24px -8px rgba(28,26,23,0.08), 0 2px 6px rgba(28,26,23,0.04)",
        "ww-lg": "0 24px 48px -12px rgba(28,26,23,0.12), 0 4px 12px rgba(28,26,23,0.04)",
        "ww-stack": "0 1px 2px rgba(28,26,23,0.06), 0 12px 32px -8px rgba(74,44,61,0.12)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: { "fade-in": "fade-in 0.35s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
