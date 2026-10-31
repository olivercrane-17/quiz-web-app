import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/env";

import "./globals.css";

// Placeholder identity until the product name and copy are decided.
const APP_NAME = "Quiz Web App";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: "A web app for creating and playing quiz games.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
