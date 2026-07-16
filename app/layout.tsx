import type { Metadata } from "next";
import "./globals.css";

const title = "HANGZHOU METRO TYPING｜杭州地铁站名打字练习";
const description = "用杭州真实地铁线路与站名练习中英文打字。";
const pagesBaseUrl = process.env.PAGES_BASE_URL ?? "http://localhost:3000";
const metadataBase = new URL(pagesBaseUrl);
const image = new URL("og.png", metadataBase).toString();

export const metadata: Metadata = {
  metadataBase,
  title,
  description,
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
