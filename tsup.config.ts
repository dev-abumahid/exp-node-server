import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

export default defineConfig({
    entry: ["src/cli.ts"],
    format: ["esm"],
    target: "node20",
    platform: "node",
    outDir: "dist",
    clean: true,
    minify: true,
    splitting: false,
    sourcemap: false,
    // runtime deps are installed from "dependencies", don't inline them
    skipNodeModulesBundle: true,
    define: {
        __VERSION__: JSON.stringify(pkg.version),
    },
});
