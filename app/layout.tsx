import type { Metadata } from "next";
import "./globals.css";

const title = "METRO TYPING｜城市地铁站名打字练习";
const description = "沿着真实城市地铁线路与站序，练习英文或拼音站名打字。";
const pagesBaseUrl = process.env.PAGES_BASE_URL ?? "http://localhost:3000";
const metadataBase = new URL(pagesBaseUrl);
const image = new URL("og.png", metadataBase).toString();

export const metadata: Metadata = {
  metadataBase,
  title,
  description,
  applicationName: "METRO TYPING",
  openGraph: {
    type: "website",
    title,
    description,
    images: [{ url: image, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
