import type { Metadata, Viewport } from "next";
import GlobalNotificationBell from "../components/GlobalNotificationBell";
import GlobalTitanNavigation from "../components/GlobalTitanNavigation";
import MobileAppChrome from "../components/MobileAppChrome";
import PwaRegistrar from "../components/PwaRegistrar";
import "./globals.css";
import "./titan-branding.css";
import "./notification-bell.css";
import "./inventory-cart.css";
import "./communications-presence.css";
import "./global-titan-nav.css";

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
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/titan-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/titan-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "mobile-web-app-capable": "yes",
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
        <GlobalTitanNavigation />
        {children}
        <GlobalNotificationBell />
        <MobileAppChrome />
        <PwaRegistrar />
      </body>
    </html>
  );
}
