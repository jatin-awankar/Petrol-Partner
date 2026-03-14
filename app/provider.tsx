"use client";

import { ReactNode } from "react";
import { ThemeProvider as NextThemeProvider, ThemeProviderProps } from "next-themes";

interface ProviderProps extends ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children, ...props }: ProviderProps) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemeProvider>
  );
}
