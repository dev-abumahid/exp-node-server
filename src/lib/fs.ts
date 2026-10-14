import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

export interface FileSpec {
    path: string;
    content: string;
}

/** Writes files, creating parent dirs as needed. Throws on the first failure. */
export function writeFiles(files: FileSpec[], cwd: string): void {
    for (const file of files) {
        fs.mkdirSync(path.dirname(file.path), { recursive: true });
        fs.writeFileSync(file.path, file.content);
        logger.success(`${path.relative(cwd, file.path)} created`);
    }
}
