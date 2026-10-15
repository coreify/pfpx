import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  minify: "terser",
  terserOptions: {
    compress: {
      passes: 2,
    },
    format: {
      comments: false,
    },
  },
  platform: "node",
  target: "node20",
  treeshake: true,
  external: ["@clack/prompts", "cheerio", "commander"],
});
