import type { PropsWithChildren } from "react";

import { ThemeProvider } from "@/app/theme";

export function AppProviders({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
