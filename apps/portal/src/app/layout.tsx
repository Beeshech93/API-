import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthProvider";

export const metadata: Metadata = {
  title: "AyitiPay — MonCash & NatCash API for developers",
  description: "One API for MonCash and NatCash mobile money payments in Haiti.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <header className="bg-navy text-white">
            <nav className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <Link href="/" className="font-bold text-lg">
                Ayiti<span className="text-lime">Pay</span>
              </Link>
              <div className="flex gap-6 text-sm items-center">
                <Link href="/docs">Docs</Link>
                <Link href="/dashboard">Dashboard</Link>
                <Link
                  href="/login"
                  className="bg-lime text-navy px-4 py-1.5 rounded-full font-semibold"
                >
                  Sign in
                </Link>
              </div>
            </nav>
          </header>
          <main className="min-h-screen">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
