import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

export interface FileSpec {
    path: string;
    content: string;
}

export interface WriteOptions {
    /** Copy existing files that are about to change into this folder first. */
    backupDir?: string | undefined;
}

export interface WriteResult {
    created: string[];
    updated: string[];
    /** Where the previous versions of `updated` files were copied, if any. */
    backupDir: string | null;
}

/**
 * Writes all files or none: if any write fails, files that were changed are
 * restored, new files and folders are removed, and the error is rethrown.
 * Files whose content wouldn't change are left alone.
 */
export function writeFiles(files: FileSpec[], cwd: string, options: WriteOptions = {}): WriteResult {
    const originals = new Map<string, string>(); // path -> previous content
    const created: string[] = [];
    const createdDirs: string[] = [];
    const pending = files.filter(
        (f) => !fs.existsSync(f.path) || fs.readFileSync(f.path, "utf-8") !== f.content,
    );
    for (const file of pending) {
        if (fs.existsSync(file.path)) originals.set(file.path, fs.readFileSync(file.path, "utf-8"));
    }

    // saved before anything is overwritten, so a failed backup changes nothing
    const backupDir = backup(originals, cwd, options.backupDir);

    const overwritten: string[] = [];
    try {
        for (const file of pending) {
            if (!originals.has(file.path)) {
                createdDirs.push(...missingDirs(path.dirname(file.path)));
                fs.mkdirSync(path.dirname(file.path), { recursive: true });
                created.push(file.path); // before writing: a partial new file is removed too
            }
            writeAtomic(file.path, file.content);
            if (originals.has(file.path)) overwritten.push(file.path);
        }
    } catch (err) {
        // best effort, step by step: one failing undo mustn't stop the others
        const attempt = (undo: () => void) => {
            try {
                undo();
            } catch {
                // nothing more we can do for this file
            }
        };
        for (const file of overwritten) attempt(() => writeAtomic(file, originals.get(file)!));
        for (const file of created) attempt(() => fs.rmSync(file, { force: true }));
        // deepest first, and only folders we created that are empty again
        for (const dir of [...new Set(createdDirs)].sort((a, b) => b.length - a.length)) {
            attempt(() => {
                if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
            });
        }
        throw err;
    }

    const rel = (p: string) => path.relative(cwd, p);
    for (const file of created) logger.success(`${rel(file)} created`);
    for (const file of originals.keys()) logger.success(`${rel(file)} updated`);

    return { created, updated: [...originals.keys()], backupDir };
}

/**
 * Writes to a temporary sibling, then renames it over the target: a crash or a
 * full disk never leaves a half-written file. Like a plain write, it refuses
 * read-only files, and it keeps the file's permissions.
 */
function writeAtomic(file: string, content: string): void {
    const existing = fs.existsSync(file) ? fs.statSync(file) : null;
    if (existing) fs.accessSync(file, fs.constants.W_OK);

    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
    try {
        fs.writeFileSync(tmp, content, existing ? { mode: existing.mode } : {});
        fs.renameSync(tmp, file);
    } catch (err) {
        fs.rmSync(tmp, { force: true });
        throw err;
    }
}

/** Saves the previous content of overwritten files, mirroring their paths. */
function backup(originals: Map<string, string>, cwd: string, dir: string | undefined): string | null {
    if (!dir || originals.size === 0) return null;
    for (const [file, content] of originals) {
        const target = path.join(dir, path.relative(cwd, file));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
    return dir;
}

/** The directories that `mkdir -p dir` would create, outermost first. */
function missingDirs(dir: string): string[] {
    const missing: string[] = [];
    let current = dir;
    while (!fs.existsSync(current)) {
        missing.unshift(current);
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return missing;
}
