import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PIFS Tubular Management",
  description: "Pipe yard inventory and tubular management for Pathfinder Inspections.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}