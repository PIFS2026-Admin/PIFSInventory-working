import type { Metadata } from "next";
import "./globals.css";
import "./titan-branding.css";

export const metadata: Metadata = {
  title: "TITAN",
  description: "Tubular Inventory Tracking & Asset Navigation.",
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

