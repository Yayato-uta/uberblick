import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(
    () => typeof matchMedia !== "undefined" && matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia(query);
    const on = (e: MediaQueryListEvent) => setMatch(e.matches);
    setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);

  return match;
}

/** Tailwind's `sm` breakpoint — below this the layout goes to phone mode. */
export const useIsPhone = (): boolean => useMediaQuery("(max-width: 639px)");

/** Narrow enough that every second x-axis label has to go. */
export const useIsNarrow = (): boolean => useMediaQuery("(max-width: 460px)");
