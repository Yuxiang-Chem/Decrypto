import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decrypto",
  description: "四人中文密码推理游戏。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
