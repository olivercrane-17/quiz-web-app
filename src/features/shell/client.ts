/**
 * The shell's client entry: the hooks and client components other features
 * use. `index.ts` never re-exports a "use client" module, because a route
 * whose server code imports a barrel gets every client module the barrel
 * re-exports in its first load, used or not (measured on Home: the param
 * hook cost it about 0.2 kB through `SiteFooter`'s import). Client islands
 * import from here, and unused exports are dropped from their chunks.
 */
export { ScrollInset, type ScrollEdge } from "./scroll-inset";
export { ShellParam } from "./shell-param";
export { TopBarTitle, type TopBarTitleProps } from "./top-bar-title";
export { usePathParam } from "./use-path-param";
