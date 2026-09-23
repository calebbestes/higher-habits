import { QueryClient } from "@tanstack/react-query";

export const mobileQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
