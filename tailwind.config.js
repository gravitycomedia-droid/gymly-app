/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary, #0058bc)",
        "primary-container": "var(--primary-container, #0070eb)",
        "on-primary-container": "#fefcff",
        "on-surface": "var(--text-primary, #1b1b1d)",
        "on-surface-variant": "var(--text-secondary, #414755)",
        "outline": "var(--text-muted, #717786)",
        "outline-variant": "var(--text-placeholder, #c1c6d7)",
        error: "var(--error, #ba1a1a)",
        tertiary: "var(--tertiary, #006762)",
        "surface-variant": "rgba(255, 255, 255, 0.4)",
        "error-container": "rgba(186, 26, 26, 0.1)",
        "on-error-container": "var(--error, #93000a)",
        "tertiary-container": "rgba(0, 103, 98, 0.1)",
        "secondary": "#6d36d4",
        "secondary-container": "#8654ef",
        "on-secondary-container": "#fffbff",
        "on-tertiary-container": "#f3fffd",
        "on-primary": "#ffffff",
        "on-secondary": "#ffffff",
        "on-tertiary": "#ffffff",
        "surface-dim": "#dcd9dc",
        "surface": "#fcf8fb",
        "surface-bright": "#fcf8fb",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f6f3f5",
        "surface-container": "#f0edef",
        "surface-container-high": "#eae7ea",
        "surface-container-highest": "#e4e2e4",
        "background": "#fcf8fb",
        "on-background": "#1b1b1d",
      },
      fontFamily: {
        'display-lg': ['"Hanken Grotesk"', 'sans-serif'],
        'headline-lg': ['"Hanken Grotesk"', 'sans-serif'],
        'headline-md': ['"Hanken Grotesk"', 'sans-serif'],
        'headline-lg-mobile': ['"Hanken Grotesk"', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'label-md': ['Geist', 'monospace'],
        'label-sm': ['Geist', 'monospace'],
      },
      fontSize: {
        "display-lg": ["48px", { "lineHeight": "56px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "label-md": ["14px", { "lineHeight": "20px", "letterSpacing": "0.02em", "fontWeight": "500" }],
        "headline-lg-mobile": ["24px", { "lineHeight": "32px", "fontWeight": "600" }],
        "headline-md": ["24px", { "lineHeight": "32px", "fontWeight": "500" }],
        "headline-lg": ["32px", { "lineHeight": "40px", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "400" }],
        "label-sm": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
        "body-md": ["16px", { "lineHeight": "24px", "fontWeight": "400" }]
      },
      spacing: {
        "stack-sm": "8px",
        "stack-md": "16px",
        "stack-lg": "24px",
        "gutter": "16px",
        "container-padding": "24px",
        "base": "16px",
        "section": "48px"
      }
    },
  },
  plugins: [],
}

