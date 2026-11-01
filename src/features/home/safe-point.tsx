"use client";

/** Today is a safe point for app updates (ARCHITECTURE §10.7). */
import { useSafePoint } from "@/features/pwa/safe-point";

export function HomeSafePoint() {
  useSafePoint();
  return null;
}
