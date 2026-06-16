import { heroui } from "@heroui/react";

export default heroui({
  defaultTheme: "light",
  themes: {
    light: {
      colors: {
        background: "#FFFFFF",
        foreground: {
          50: "#F8FAFA",
          100: "#F0F4F4",
          200: "#DDE4E4",
          300: "#C4D0D0",
          400: "#9AA9A9",
          500: "#516162",
          600: "#46595A",
          700: "#3B5050",
          800: "#2C5352",
          900: "#203F3E",
          DEFAULT: "#2C5352",
        },
        divider: "rgba(81, 97, 98, 0.18)",
        focus: "#9D7474",
        content1: {
          DEFAULT: "#FFFFFF",
          foreground: "#2C5352",
        },
        content2: {
          DEFAULT: "#F7FAFA",
          foreground: "#2C5352",
        },
        content3: {
          DEFAULT: "#EFF6F6",
          foreground: "#2C5352",
        },
        content4: {
          DEFAULT: "#E2F0F0",
          foreground: "#2C5352",
        },
        default: {
          50: "#FBFDFD",
          100: "#F4F9F9",
          200: "#E8F3F3",
          300: "#D5EAEA",
          400: "#B9DDDD",
          500: "#A0D5D5",
          600: "#82BABA",
          700: "#668F8F",
          800: "#516162",
          900: "#3C4B4C",
          DEFAULT: "#E8F3F3",
          foreground: "#2C5352",
        },
        primary: {
          50: "#EEF5F5",
          100: "#D9E8E8",
          200: "#B7D1D0",
          300: "#8FB1B0",
          400: "#5F8685",
          500: "#2C5352",
          600: "#284B4A",
          700: "#223F3E",
          800: "#1C3433",
          900: "#162827",
          DEFAULT: "#2C5352",
          foreground: "#FFFFFF",
        },
        secondary: {
          50: "#FFF8F8",
          100: "#FDECEC",
          200: "#FADBDD",
          300: "#F7C9CB",
          400: "#F3B7B9",
          500: "#DFA3A5",
          600: "#C78D90",
          700: "#9D7474",
          800: "#7E5D5D",
          900: "#604646",
          DEFAULT: "#F3B7B9",
          foreground: "#2C5352",
        },
      },
    },
    dark: {
      colors: {
        primary: {
          DEFAULT: "#A0D5D5",
          foreground: "#2C5352",
        },
        secondary: {
          DEFAULT: "#F3B7B9",
          foreground: "#2C5352",
        },
      },
    },
  },
});
