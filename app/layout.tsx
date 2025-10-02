import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import Navbar from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";

const poppins = Poppins({
  subsets: ["latin"], // add more if needed
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"], // all weights
  style: ["normal", "italic"], // supports both
  display: "swap", // improves performance
  variable: "--font-poppins", // creates a CSS variable
});

export const metadata: Metadata = {
  title: "Petrol Partner",
  description: "College-centric ride sharing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${poppins.variable} font-sans antialiased`}>
      <ClerkProvider>
        <body>
          <Navbar />
          {children}
          <Toaster />
        </body>
      </ClerkProvider>
    </html>
  );
}
