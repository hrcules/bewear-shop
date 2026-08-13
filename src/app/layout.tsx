import "./globals.css";

import type { Metadata } from "next";
import { Poppins } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import ReactQueryProvider from "@/providers/react-query";
import Footer from "@/components/common/footer";

import { Analytics } from "@vercel/analytics/next";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BEWEAR | Sua vitrine digital em minutos",
    template: "%s | BEWEAR",
  },
  description:
    "A plataforma completa para lojistas criarem seu e-commerce com subdomínio próprio.",

  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${poppins.variable} flex min-h-screen flex-col antialiased`}
        suppressHydrationWarning
      >
        <ReactQueryProvider>
          <main className="flex-1">{children}</main>
        </ReactQueryProvider>

        <Analytics />

        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
