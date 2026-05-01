import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SidebarLayout } from "@/components/sidebar-layout";

export const metadata: Metadata = {
  title: "Habit Tracker",
  description: "A minimal personal habit tracker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <SidebarLayout>{children}</SidebarLayout>
        </Providers>
      </body>
    </html>
  );
}
