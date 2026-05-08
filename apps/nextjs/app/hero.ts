import { heroui } from "@heroui/react";

export default heroui({
  themes: {
    light: {
      colors: {
        primary: {
          DEFAULT: "#121212",
          foreground: "#E0E0E0",
        },
      },
    },
    dark: {
      colors: {
        primary: {
          DEFAULT: "#E0E0E0",
          foreground: "#121212",
        },
      },
    },
  },
});
