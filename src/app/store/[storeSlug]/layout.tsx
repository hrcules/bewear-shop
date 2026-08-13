import type { Metadata } from "next";
import { Poppins } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import ReactQueryProvider from "@/providers/react-query";

import { getTenantStore } from "@/lib/tentat";
import Footer from "@/components/common/footer";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const store = await getTenantStore();

  const storeName = store?.name || "BEWEAR";

  return {
    title: {
      default: storeName,
      template: `${storeName} | %s`,
    },
    description: "Plataforma de E-commerce",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = await getTenantStore();

  return (
    <html lang="en">
      <body
        className={`${poppins.variable} flex min-h-screen flex-col antialiased`}
        style={
          {
            "--primary-color": store?.colorPrimary || undefined,
          } as React.CSSProperties
        }
      >
        <ReactQueryProvider>
          <main className="flex-1">{children}</main>

          <Footer />
        </ReactQueryProvider>

        <Toaster position="top-center" />
      </body>
    </html>
  );
}
