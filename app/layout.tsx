import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TaxStudio - Tax Management Tool",
  description: "Manage your transactions and receipts for tax purposes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="overflow-hidden">
      <body className={`${inter.className} overflow-hidden`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
