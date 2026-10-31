/**
 * Prettier defaults plus Tailwind class sorting.
 *
 * @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions}
 */
const config = {
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4 has no JS config, so point the plugin at the CSS entry point.
  tailwindStylesheet: "./src/app/globals.css",
  // Also sort classes passed to these helpers once they exist.
  tailwindFunctions: ["clsx", "cn", "cva"],
};

export default config;
