"use client";

import { useEffect, useMemo, useRef } from "react";
import { useToast } from "@/components/toast";

/**
 * De toast-context krijgt bij elke render een nieuw object; als zo'n object in de
 * afhankelijkheden van een laadfunctie staat, ontstaat bij een foutmelding een
 * oneindige laadlus. Deze variant is stabiel en roept altijd de nieuwste toast aan.
 */
export function useStableToast() {
  const toast = useToast();
  const ref = useRef(toast);
  useEffect(() => {
    ref.current = toast;
  });
  return useMemo(() => ({ success: (m: string) => ref.current.success(m), error: (m: string) => ref.current.error(m) }), []);
}
