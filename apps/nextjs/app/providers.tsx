"use client";

import { HeroUIProvider } from "@heroui/system";
import { addCollection } from "@iconify/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// Pre-load icon sets so Iconify never fetches from the CDN.
import mdiIcons from "@iconify-json/mdi/icons.json";
import fa7SolidIcons from "@iconify-json/fa7-solid/icons.json";
import fa7RegularIcons from "@iconify-json/fa7-regular/icons.json";
addCollection(mdiIcons);
addCollection(fa7SolidIcons);
addCollection(fa7RegularIcons);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <HeroUIProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </HeroUIProvider>
  );
}
