import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth";
import { bodyFont, logoFont } from "@/app/fonts";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "FiBuKI - Tax Management Tool",
  description: "Manage your transactions and receipts for tax purposes",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="overflow-hidden">
      <body
        className={`${bodyFont.className} ${logoFont.variable} overflow-hidden`}
      >
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
