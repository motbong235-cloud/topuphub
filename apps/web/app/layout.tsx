import type { Metadata } from "next";
import { Noto_Sans_Khmer, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";

const khmer = Noto_Sans_Khmer({ subsets: ["khmer"], variable: "--font-khmer", display: "swap" });
const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });

export const metadata: Metadata = {
  title: "TopUpHub — Game top-up Cambodia",
  description: "Instant game top-up with ABA PAY / KHQR. Reseller API available.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="km" className={`${khmer.variable} ${latin.variable}`}>
      <body className="font-sans">
        <Providers>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
