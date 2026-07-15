import type { Metadata, Viewport } from "next";
import PwaRegistrar from "../components/PwaRegistrar";
import "./globals.css";
import "./titan-branding.css";

export const metadata: Metadata = {
  title: "TITAN",
  description: "Tubular Inventory Tracking & Asset Navigation.",
  applicationName: "TITAN",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TITAN",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/titan-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/titan-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0d10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegistrar />
      </body>
    </html>
  );
}
