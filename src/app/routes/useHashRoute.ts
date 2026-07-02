import { useCallback, useEffect, useState } from "react";

import { normalizeRoutePath, type RoutePath } from "./routeConfig";

function readHashRoute(): RoutePath {
  if (typeof window === "undefined") {
    return "/";
  }

  return normalizeRoutePath(window.location.hash);
}

function syncInvalidHash(normalizedPath: RoutePath): void {
  if (typeof window === "undefined" || window.location.hash === "") {
    return;
  }

  const rawPath = window.location.hash.slice(1) || "/";

  if (rawPath !== normalizedPath) {
    window.history.replaceState(null, "", `#${normalizedPath}`);
  }
}

export function useHashRoute() {
  const [activePath, setActivePath] = useState<RoutePath>(readHashRoute);

  useEffect(() => {
    const updateActivePath = () => {
      const normalizedPath = readHashRoute();

      syncInvalidHash(normalizedPath);
      setActivePath(normalizedPath);
    };

    window.addEventListener("hashchange", updateActivePath);
    updateActivePath();

    return () => {
      window.removeEventListener("hashchange", updateActivePath);
    };
  }, []);

  const navigate = useCallback((path: RoutePath) => {
    if (typeof window === "undefined") {
      return;
    }

    if (readHashRoute() === path) {
      setActivePath(path);
      return;
    }

    window.location.hash = path;
  }, []);

  return { activePath, navigate };
}
