import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Binance Futures Platform",
  description: "Nova plataforma do bot em Next.js + NestJS + Fastify + Prisma",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
