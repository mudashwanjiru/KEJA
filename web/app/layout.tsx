import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { KejaLanguageProvider, LanguageControl } from "@/lib/language";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MTAA | Find Your Place. Find Your People.",
    template: "%s | MTAA",
  },
  description: "Discover and connect with properties, businesses, products and everyday services across Kenya.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <KejaLanguageProvider>
          {children}
          <LanguageControl />
        </KejaLanguageProvider>
      </body>
    </html>
  );
}
