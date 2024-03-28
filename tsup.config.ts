import { defineConfig, type Options } from "tsup";

export default defineConfig((options: Options) => ({
  entryPoints: ["src/main.ts"],
  clean: true,
  minify: false,
  sourcemap: true,
  format: ["esm"],
  external: [],
  ...options,
}));
