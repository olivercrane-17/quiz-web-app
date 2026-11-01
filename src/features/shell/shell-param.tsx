"use client";

/**
 * Stubs only: the route-module placeholders of the rewritten shells render
 * this hidden marker, as a child of `<PagePlaceholder>`, with the param
 * their address carries, so e2e/routing/rewrites.spec.ts can check that a
 * reused shell follows the address (§10.1). A real route module renders its
 * own island, which reads the same value through `usePathParam()`. The
 * hook sits inside its own `<Suspense>` (§10.2 rule 2).
 */
import { Suspense } from "react";

import { usePathParam } from "./use-path-param";

function Marker({ source }: { source: string }) {
  const param = usePathParam(source);
  return <span hidden data-shell-param={param ?? ""} />;
}

export function ShellParam({ source }: { source: string }) {
  return (
    <Suspense fallback={null}>
      <Marker source={source} />
    </Suspense>
  );
}
