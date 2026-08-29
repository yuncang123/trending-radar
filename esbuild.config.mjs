import esbuild from "esbuild";
import { builtinModules } from "node:module";

const production = process.argv.includes("production");

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
  format: "cjs",
  platform: "node",
  target: "es2020",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: "main.js"
});
