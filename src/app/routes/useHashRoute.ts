import { useCallback, useEffect, useState } from "react";

import { normalizeRoutePath, type RoutePath } from "./routeConfig";

function readHashRoute(): RoutePath {
  if (typeof window === "undefined") {
    return "/";
  }

  return normalizeRoutePath(window.location.hash);
}

export function useHashRoute() {
  const [activePath, setActivePath] = useState<RoutePath>(readHashRoute);

  useEffect(() => {
    const updateActivePath = () => {
      setActivePath(readHashRoute());
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

