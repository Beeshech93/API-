import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthProvider";
import { LocaleProvider } from "@/lib/i18n";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "HaitiPay API — MonCash & NatCash",
  description: "Une seule API pour MonCash et NatCash. One API for MonCash and NatCash payments in Haiti.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <LocaleProvider>
          <AuthProvider>
            <Header />
            {children}
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
