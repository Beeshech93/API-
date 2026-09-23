import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthProvider";
import { LocaleProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "AyitiPay — MonCash & NatCash API for developers",
  description: "One API for MonCash and NatCash mobile money payments in Haiti.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          <AuthProvider>
            <Header />
            <main className="min-h-screen">{children}</main>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
