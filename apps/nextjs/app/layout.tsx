import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Providers } from "./providers";

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
          <Suspense fallback={<div className="min-h-dvh bg-background" />}>
            <SidebarLayout>{children}</SidebarLayout>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
