import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * `templates/` lives at the package root. When bundled, this code runs from
 * `dist/cli.js` (one level down); from source (tests) it runs from
 * `src/lib/paths.ts` (two levels down).
 */
export const TEMPLATES_DIR =
    path.basename(here) === "lib"
        ? path.resolve(here, "../../templates")
        : path.resolve(here, "../templates");
