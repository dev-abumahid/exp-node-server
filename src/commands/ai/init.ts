import fs from "node:fs";
import path from "node:path";
import { CliError } from "../../lib/errors.js";
import { BACKUP_ROOT, type FileSpec, writeFiles } from "../../lib/fs.js";
import { logger } from "../../lib/logger.js";
import {
    getProjectType,
    isDatabase,
    PROJECT_CONFIG_FILE,
    type Database,
} from "../../lib/project-config.js";
import {
    AGENTS_FILE,
    buildExpFlowConfig,
    EXPFLOW_CONFIG_FILE,
    mergeAgentsContent,
    readExpFlowTemplate,
    readProjectName,
    renderTemplateContent,
} from "../../utils/ai-template.js";

export interface AIInitOptions {
    /** Project root. Defaults to `process.cwd()`. */
    cwd?: string;
    /** Refresh managed files that already exist (previous versions are backed up). */
    force?: boolean;
    /** Overrides the database detected from `.projectrc.json`. */
    database?: Database;
}

export interface AIInitResult {
    /** Files created, relative to the project root. */
    created: string[];
    /** Files updated, relative to the project root. */
    updated: string[];
    /** Existing user-managed files that were left alone. */
    conflicts: string[];
    /** Where `--force` stored the previous versions, if anything was overwritten. */
    backupDir: string | null;
}

/**
 * Installs the agent-independent ExpFlow workflow into a project:
 *
 * - `.expflow/` (config, rules, workflows, change artifacts)
 * - `.opencode/commands/` (OpenCode adapters)
 * - `.agents/skills/` (Antigravity adapters)
 * - `AGENTS.md` (global instructions)
 *
 * Existing user files are never deleted. Managed files that differ are only
 * replaced with `--force`, and their previous content is backed up first.
 */
export async function initAIWorkflow({
    cwd = process.cwd(),
    force = false,
    database: databaseOverride,
}: AIInitOptions = {}): Promise<AIInitResult> {
    const root = path.resolve(cwd);
    const database = resolveDatabase(root, databaseOverride);
    const projectName = readProjectName(root);

    const files: FileSpec[] = [];
    const conflicts: string[] = [];
    let agentsChanged = false;

    for (const templateFile of readExpFlowTemplate()) {
        const relative = path.normalize(templateFile.path);
        const target = path.join(root, relative);
        const exists = fs.existsSync(target);
        const content =
            relative === path.normalize(EXPFLOW_CONFIG_FILE)
                ? buildExpFlowConfig({ projectName, database })
                : renderTemplateContent(relative, templateFile.content, { projectName, database });

        if (relative === AGENTS_FILE) {
            const merged = mergeAgentsContent(
                exists ? fs.readFileSync(target, "utf-8") : null,
                content,
                force,
            );
            if (merged.conflict) {
                conflicts.push(relative);
                continue;
            }
            files.push({ path: target, content: merged.content });
            agentsChanged = agentsChanged || (exists && merged.changed);
            continue;
        }

        // change artifacts and project context belong to the user: only missing files are created
        if (isUserOwned(relative) && exists) continue;

        if (exists && !force && fs.readFileSync(target, "utf-8") !== content) {
            conflicts.push(relative);
            continue;
        }

        files.push({ path: target, content });
    }

    const backupDir = force
        ? path.join(root, BACKUP_ROOT, new Date().toISOString().replace(/[:.]/g, "-"))
        : undefined;

    const written = writeFiles(files, root, { backupDir });

    if (agentsChanged) {
        logger.success(`${AGENTS_FILE} updated: ExpFlow instructions added`);
    }

    if (conflicts.length > 0) {
        logger.warn("Kept existing file(s) that differ from the ExpFlow template:");
        for (const conflict of conflicts) logger.warn(`  - ${conflict.split(path.sep).join("/")}`);
        logger.info(
            "  Review them, or re-run 'exp-node-server ai init --force' to replace the managed ones.",
        );
    }

    const toRelative = (file: string) => path.relative(root, file).split(path.sep).join("/");

    return {
        created: written.created.map(toRelative),
        updated: written.updated.map(toRelative),
        conflicts: conflicts.map((file) => file.split(path.sep).join("/")),
        backupDir: written.backupDir,
    };
}

/** `.expflow/changes`, `.expflow/archive` and `.expflow/context` are owned by the user. */
function isUserOwned(relative: string): boolean {
    return [
        path.join(".expflow", "changes"),
        path.join(".expflow", "archive"),
        path.join(".expflow", "context"),
    ].some((dir) => relative === dir || relative.startsWith(`${dir}${path.sep}`));
}

/**
 * Detects the project's database from `.projectrc.json`. Existing ExpFlow
 * configs are reused, and `--database` overrides both.
 */
function resolveDatabase(cwd: string, override: Database | undefined): Database {
    if (override) return override;

    if (fs.existsSync(path.join(cwd, PROJECT_CONFIG_FILE))) return getProjectType(cwd);

    const expflowConfig = path.join(cwd, EXPFLOW_CONFIG_FILE);
    if (fs.existsSync(expflowConfig)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(expflowConfig, "utf-8")) as {
                database?: { provider?: unknown };
            };
            if (isDatabase(parsed.database?.provider)) return parsed.database.provider;
        } catch {
            // fall through to the actionable error below
        }
    }

    throw new CliError(
        `${PROJECT_CONFIG_FILE} not found. Run 'exp-node-server ai init' from the root of a project created with exp-node-server, or pass --database <mongoose|prisma>.`,
    );
}
