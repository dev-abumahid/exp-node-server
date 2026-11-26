import fs from "node:fs";
import path from "node:path";
import { listRegisteredRoutes } from "../injectors/route.js";
import { CliError } from "../lib/errors.js";
import { BACKUP_ROOT, type FileSpec, writeFiles } from "../lib/fs.js";
import { logger } from "../lib/logger.js";
import { isDatabase, type Database } from "../lib/project-config.js";
import {
    CONTEXT_DIR,
    EXPFLOW_CONFIG_FILE,
    MODELS_MARKER_END,
    MODELS_MARKER_START,
    MODULES_MARKER_END,
    MODULES_MARKER_START,
} from "./ai-template.js";

export const MODULES_REGISTRY_FILE = `${CONTEXT_DIR}/modules.md`;
export const SCHEMA_OVERVIEW_FILE = `${CONTEXT_DIR}/database/schema-overview.md`;
export const SYNC_REPORT_FILE = `${CONTEXT_DIR}/sync-report.md`;

/** Docs for shared infrastructure, not a single `src/app/modules/` folder. */
const STATIC_CONTEXT_MODULES = new Set([
    "auth",
    "profile",
    "queue",
    "email",
    "storage",
    "rate-limit",
    "api-docs",
]);

/** Modules whose context document does not use the module directory name. */
const CONTEXT_BASENAME: Record<string, string> = {
    account: "auth",
};

export type ContextStatus = "missing" | "stub" | "documented";

export interface ContextModule {
    name: string;
    route: string | null;
    /** Project-relative path to the context document. */
    contextPath: string;
    /** Path relative to `.expflow/context/`, as shown in the registry. */
    displayPath: string;
    contextStatus: ContextStatus;
}

export interface ContextModel {
    name: string;
    source: string;
}

export interface ContextScan {
    database: Database;
    modules: ContextModule[];
    models: ContextModel[];
    orphanContexts: string[];
    modulesOutdated: boolean;
    schemaOutdated: boolean;
    inSync: boolean;
}

export interface SyncOptions {
    cwd?: string;
    /** Apply managed registry/model updates and create missing context stubs. */
    apply?: boolean;
}

export interface SyncResult extends ContextScan {
    reportPath: string;
    applied: boolean;
    created: string[];
    updated: string[];
    backupDir: string | null;
}

/**
 * Scans the project, writes a human-readable sync report, and optionally applies
 * the managed updates. It never touches source code and never overwrites a
 * user-written context document.
 */
export function syncContext({ cwd = process.cwd(), apply = false }: SyncOptions = {}): SyncResult {
    const root = path.resolve(cwd);
    const scan = scanProject(root);
    const report = buildSyncReport(scan);

    const reportPath = path.join(root, SYNC_REPORT_FILE);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report);

    let created: string[] = [];
    let updated: string[] = [];
    let backupDir: string | null = null;

    if (apply) {
        const result = applyContextUpdates(root, scan);
        created = result.created;
        updated = result.updated;
        backupDir = result.backupDir;
    }

    if (apply) {
        logger.success(`Context synced. Report: ${SYNC_REPORT_FILE}`);
        const stubs = scan.modules.filter((module) => module.contextStatus !== "documented");
        if (stubs.length > 0) {
            logger.warn(
                `${stubs.length} context document(s) still need verified content: ${stubs
                    .map((module) => module.contextPath)
                    .join(", ")}`,
            );
        }
    } else if (scan.inSync) {
        logger.success("Context is in sync.");
    } else {
        logger.warn("Context drift detected.");
        for (const module of scan.modules.filter((m) => m.contextStatus !== "documented")) {
            logger.warn(`  - ${module.contextPath} (${module.contextStatus})`);
        }
        for (const orphan of scan.orphanContexts) logger.warn(`  - ${orphan} (orphan)`);
        if (scan.modulesOutdated) logger.warn(`  - ${MODULES_REGISTRY_FILE} (registry stale)`);
        if (scan.schemaOutdated) logger.warn(`  - ${SCHEMA_OVERVIEW_FILE} (models stale)`);
        logger.info(`Report: ${SYNC_REPORT_FILE}`);
        logger.info("Run 'exp-node-server ai sync --apply' to update managed sections and create missing stubs.");
    }

    if (scan.orphanContexts.length > 0) {
        logger.warn("Orphan context documents were left untouched; rename or remove them after review.");
    }

    return {
        ...scan,
        reportPath: SYNC_REPORT_FILE,
        applied: apply,
        created,
        updated,
        backupDir,
    };
}

export function scanProject(cwd: string): ContextScan {
    const database = readContextDatabase(cwd);
    const routes = detectRouteMap(cwd);
    const modules = detectModules(cwd, routes);
    const models = detectModels(cwd, database);
    const orphanContexts = findOrphanContexts(cwd, modules);
    const modulesOutdated = isManagedBlockOutdated(
        cwd,
        MODULES_REGISTRY_FILE,
        MODULES_MARKER_START,
        MODULES_MARKER_END,
        renderModulesBlock(modules),
    );
    const schemaOutdated = isManagedBlockOutdated(
        cwd,
        SCHEMA_OVERVIEW_FILE,
        MODELS_MARKER_START,
        MODELS_MARKER_END,
        renderModelsBlock(models, database),
    );

    return {
        database,
        modules,
        models,
        orphanContexts,
        modulesOutdated,
        schemaOutdated,
        inSync:
            modules.every((module) => module.contextStatus === "documented") &&
            orphanContexts.length === 0 &&
            !modulesOutdated &&
            !schemaOutdated,
    };
}

function readContextDatabase(cwd: string): Database {
    const configFile = path.join(cwd, EXPFLOW_CONFIG_FILE);
    if (!fs.existsSync(configFile)) {
        throw new CliError(
            "ExpFlow is not initialized. Run 'exp-node-server ai init' before 'ai sync'.",
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    } catch {
        throw new CliError(`${EXPFLOW_CONFIG_FILE} is not valid JSON.`);
    }

    const provider = (parsed as { database?: { provider?: unknown } } | null)?.database?.provider;
    if (!isDatabase(provider)) {
        throw new CliError(
            `Invalid "database.provider" in ${EXPFLOW_CONFIG_FILE}. Run 'exp-node-server ai init --force'.`,
        );
    }
    return provider;
}

function detectRouteMap(cwd: string): Map<string, string> {
    const map = new Map<string, string>();
    const routesFile = path.join(cwd, "src/routes.ts");
    if (!fs.existsSync(routesFile)) return map;

    const content = fs.readFileSync(routesFile, "utf-8");
    const imports = new Map<string, string>();
    for (const match of content.matchAll(
        /import\s+(\w+)\s+from\s+['"][^'"]*[\\/]modules[\\/](\w+)[\\/][^'"]+\.route(?:\.js)?['"]/g,
    )) {
        imports.set(match[1]!, match[2]!);
    }

    for (const registered of listRegisteredRoutes(content)) {
        if (!registered.route) continue;
        const module = imports.get(registered.route);
        if (!module) continue;
        const route = registered.path === "/" ? "/api" : `/api${registered.path}`;
        if (!map.has(module)) map.set(module, route);
    }
    return map;
}

function detectModules(cwd: string, routes: Map<string, string>): ContextModule[] {
    const names = new Set<string>();
    for (const root of ["src/app/modules", "src/modules"]) {
        const dir = path.join(cwd, root);
        if (!fs.existsSync(dir)) continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) names.add(entry.name);
        }
    }

    return [...names].sort().map((name) => {
        const basename = CONTEXT_BASENAME[name] ?? name;
        const displayPath = `modules/${basename}.md`;
        const contextPath = `${CONTEXT_DIR}/${displayPath}`;
        return {
            name,
            route: routes.get(name) ?? null,
            contextPath,
            displayPath,
            contextStatus: contextStatus(path.join(cwd, contextPath)),
        };
    });
}

function contextStatus(file: string): ContextStatus {
    if (!fs.existsSync(file)) return "missing";
    return fs.readFileSync(file, "utf-8").includes("<!-- expflow:stub -->") ? "stub" : "documented";
}

function findOrphanContexts(cwd: string, modules: ContextModule[]): string[] {
    const dir = path.join(cwd, CONTEXT_DIR, "modules");
    if (!fs.existsSync(dir)) return [];

    const known = new Set([
        ...STATIC_CONTEXT_MODULES,
        ...modules.map((module) => path.basename(module.contextPath, ".md")),
    ]);

    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => path.basename(entry.name, ".md"))
        .filter((name) => !known.has(name))
        .sort()
        .map((name) => `${CONTEXT_DIR}/modules/${name}.md`);
}

function detectModels(cwd: string, database: Database): ContextModel[] {
    const found = new Map<string, string>();

    if (database === "prisma") {
        const dir = path.join(cwd, "prisma/schema");
        if (fs.existsSync(dir)) {
            for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".prisma")).sort()) {
                const content = fs.readFileSync(path.join(dir, file), "utf-8");
                for (const match of content.matchAll(/\bmodel\s+([A-Za-z_]\w*)\s*\{/g)) {
                    found.set(match[1]!, `prisma/schema/${file}`);
                }
            }
        }
    } else {
        for (const file of walk(path.join(cwd, "src"), (name) => name.endsWith(".ts"))) {
            const content = fs.readFileSync(file, "utf-8");
            for (const match of content.matchAll(/\bmodel\(\s*['"`]([^'"`]+)['"`]/g)) {
                found.set(match[1]!, path.relative(cwd, file).split(path.sep).join("/"));
            }
        }
    }

    return [...found]
        .map(([name, source]) => ({ name, source }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function walk(dir: string, include: (name: string) => boolean): string[] {
    if (!fs.existsSync(dir)) return [];
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(target, include));
        else if (include(entry.name)) files.push(target);
    }
    return files;
}

export function renderModulesBlock(modules: ContextModule[]): string {
    if (modules.length === 0) {
        return `${MODULES_MARKER_START}\n_No modules detected._\n${MODULES_MARKER_END}`;
    }

    const rows = modules.map(
        (module) =>
            `| ${module.name} | Implemented | ${module.route ?? "internal"} | ${module.displayPath} |`,
    );

    return [
        MODULES_MARKER_START,
        "| Module | Status | Route | Context |",
        "| --- | --- | --- | --- |",
        ...rows,
        MODULES_MARKER_END,
    ].join("\n");
}

export function renderModelsBlock(models: ContextModel[], database: Database): string {
    if (models.length === 0) {
        return `${MODELS_MARKER_START}\n_No models detected._\n${MODELS_MARKER_END}`;
    }

    const label = database === "prisma" ? "Model" : "Collection";
    const rows = models.map((model) => `| ${model.name} | ${model.source} |`);

    return [
        MODELS_MARKER_START,
        `| ${label} | Source |`,
        "| --- | --- |",
        ...rows,
        MODELS_MARKER_END,
    ].join("\n");
}

function isManagedBlockOutdated(
    cwd: string,
    file: string,
    startMarker: string,
    endMarker: string,
    expected: string,
): boolean {
    const target = path.join(cwd, file);
    if (!fs.existsSync(target)) return true;

    const current = extractManagedBlock(fs.readFileSync(target, "utf-8"), startMarker, endMarker);
    return current === null || current.trim() !== expected.trim();
}

function extractManagedBlock(content: string, startMarker: string, endMarker: string): string | null {
    const start = content.indexOf(startMarker);
    const end = content.indexOf(endMarker, start);
    if (start === -1 || end === -1) return null;
    return content.slice(start, end + endMarker.length);
}

function replaceManagedBlock(
    content: string,
    startMarker: string,
    endMarker: string,
    block: string,
): string | null {
    const start = content.indexOf(startMarker);
    const end = content.indexOf(endMarker, start);
    if (start === -1 || end === -1) return null;

    const after = content.slice(end + endMarker.length).replace(/^\r?\n/, "");
    return `${content.slice(0, start)}${block}${after}`;
}

function applyContextUpdates(
    cwd: string,
    scan: ContextScan,
): { created: string[]; updated: string[]; backupDir: string | null } {
    const files: FileSpec[] = [];

    appendManagedUpdate(
        files,
        cwd,
        MODULES_REGISTRY_FILE,
        MODULES_MARKER_START,
        MODULES_MARKER_END,
        renderModulesBlock(scan.modules),
    );
    appendManagedUpdate(
        files,
        cwd,
        SCHEMA_OVERVIEW_FILE,
        MODELS_MARKER_START,
        MODELS_MARKER_END,
        renderModelsBlock(scan.models, scan.database),
    );

    for (const module of scan.modules) {
        if (module.contextStatus !== "missing") continue;
        files.push({
            path: path.join(cwd, module.contextPath),
            content: buildModuleStub(module, scan.database),
        });
    }

    const backupDir = path.join(
        cwd,
        BACKUP_ROOT,
        new Date().toISOString().replace(/[:.]/g, "-"),
    );
    const written = writeFiles(files, cwd, { backupDir });
    const toRelative = (file: string) => path.relative(cwd, file).split(path.sep).join("/");

    return {
        created: written.created.map(toRelative),
        updated: written.updated.map(toRelative),
        backupDir: written.backupDir,
    };
}

function appendManagedUpdate(
    files: FileSpec[],
    cwd: string,
    file: string,
    startMarker: string,
    endMarker: string,
    block: string,
): void {
    const target = path.join(cwd, file);
    if (!fs.existsSync(target)) {
        logger.warn(`${file} not found; run 'exp-node-server ai init' first.`);
        return;
    }

    const content = fs.readFileSync(target, "utf-8");
    const updated = replaceManagedBlock(content, startMarker, endMarker, block);
    if (updated === null) {
        logger.warn(`${file} has no managed block; left untouched.`);
        return;
    }
    if (updated !== content) files.push({ path: target, content: updated });
}

function buildModuleStub(module: ContextModule, database: Database): string {
    return `# ${module.name} Module

<!-- expflow:stub -->
Status: Needs context
Module: ${module.name}
Route: ${module.route ?? "internal (no HTTP route)"}
Database: ${database}

## Purpose

TODO: Describe what this module does in one or two sentences.

## Capabilities

- TODO

## Integration

- Reuse this module; do not create a parallel implementation.
- TODO: document the entry points and integration pattern.

## Entry points

- \`src/app/modules/${module.name}/\`

## Restrictions

- Never duplicate this module.
- Inspect the source before changing its public behaviour.
`;
}

function buildSyncReport(scan: ContextScan): string {
    const needsContext = scan.modules.filter((module) => module.contextStatus !== "documented");
    const lines: string[] = [
        "# Context Sync Report",
        "",
        `Generated: ${new Date().toISOString()}`,
        `Database: ${scan.database}`,
        `Status: ${scan.inSync ? "in sync" : "drift detected"}`,
        "",
        "## Detected modules",
        "",
    ];

    if (scan.modules.length === 0) {
        lines.push("_No modules detected._");
    } else {
        lines.push("| Module | Route | Context | Status |");
        lines.push("| --- | --- | --- | --- |");
        for (const module of scan.modules) {
            lines.push(
                `| ${module.name} | ${module.route ?? "internal"} | ${module.displayPath} | ${module.contextStatus} |`,
            );
        }
    }

    lines.push("", "## Detected models", "");
    if (scan.models.length === 0) {
        lines.push("_No models detected._");
    } else {
        lines.push("| Name | Source |");
        lines.push("| --- | --- |");
        for (const model of scan.models) lines.push(`| ${model.name} | ${model.source} |`);
    }

    lines.push("", "## Proposed changes", "");
    if (scan.inSync) {
        lines.push("- No changes. Context is in sync.");
    } else {
        for (const module of needsContext) {
            lines.push(`- ${module.contextStatus === "missing" ? "Create" : "Fill in"} \`${module.contextPath}\`.`);
        }
        if (scan.modulesOutdated) lines.push(`- Update the module registry in \`${MODULES_REGISTRY_FILE}\`.`);
        if (scan.schemaOutdated) lines.push(`- Update the model registry in \`${SCHEMA_OVERVIEW_FILE}\`.`);
        for (const orphan of scan.orphanContexts) {
            lines.push(`- Review orphan context document \`${orphan}\` (rename or remove it).`);
        }
        lines.push("");
        lines.push("Run `npx exp-node-server ai sync --apply` to update managed sections and create missing stubs.");
    }

    lines.push("");
    return lines.join("\n");
}
