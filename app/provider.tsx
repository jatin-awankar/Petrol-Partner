"use client";

import { ReactNode } from "react";
import { ThemeProvider as NextThemeProvider, ThemeProviderProps } from "next-themes";

interface ProviderProps extends ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children, ...props }: ProviderProps) {
  return (
    <NextThemeProvider {...props} defaultTheme="system" attribute="class">
      {children}
    </NextThemeProvider>
  );
}
