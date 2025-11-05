import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/server/index.ts",
    "src/react/**/*.ts",
    "src/api/internal/Api.ts",
    "src/api/internal/Function.ts",
    "src/api/internal/Group.ts",
  ],
  dts: {
    sourcemap: true,
  },
  sourcemap: true,
  clean: true,
  format: ["esm", "cjs"],
});
