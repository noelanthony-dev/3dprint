import { Suspense } from "react";

import { PageLoading } from "@/components/feedback/PageLoading";

import { AppShell } from "./layout/AppShell";
import { AppProviders } from "./providers/AppProviders";
import { appRoutes, findRouteByPath } from "./routes/routeConfig";
import { useHashRoute } from "./routes/useHashRoute";

export function App() {
  const { activePath, navigate } = useHashRoute();
  const activeRoute = findRouteByPath(activePath);
  const ActivePage = activeRoute.Page;

  return (
    <AppProviders>
      <AppShell
        activePath={activeRoute.path}
        onNavigate={navigate}
        routes={appRoutes}
      >
        <Suspense fallback={<PageLoading label={activeRoute.label} />}>
          <ActivePage />
        </Suspense>
      </AppShell>
    </AppProviders>
  );
}

