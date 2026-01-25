import { DynaPuff, Figtree } from "next/font/google";

export const bodyFont = Figtree({
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const logoFont = DynaPuff({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-logo",
});
