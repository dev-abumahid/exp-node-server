import fs from "node:fs";
import path from "node:path";
import type { Database } from "../lib/project-config.js";
import { TEMPLATES_DIR } from "../lib/paths.js";

/** The canonical ExpFlow template that ships with the package. */
export const EXPFLOW_TEMPLATE_DIR = path.join(TEMPLATES_DIR, "expflow");

export const EXPFLOW_CONFIG_FILE = ".expflow/config.json";
export const CONTEXT_DIR = ".expflow/context";
export const SCHEMA_OVERVIEW_FILE = ".expflow/context/database/schema-overview.md";
export const AGENTS_FILE = "AGENTS.md";
export const EXPFLOW_MARKER_START = "<!-- expflow:start -->";
export const EXPFLOW_MARKER_END = "<!-- expflow:end -->";
export const MODULES_MARKER_START = "<!-- expflow:modules:start -->";
export const MODULES_MARKER_END = "<!-- expflow:modules:end -->";
export const MODELS_MARKER_START = "<!-- expflow:models:start -->";
export const MODELS_MARKER_END = "<!-- expflow:models:end -->";

export interface TemplateFile {
    /** Path relative to the template root, using the host separator. */
    path: string;
    content: string;
}

export interface ExpFlowConfigInput {
    projectName: string;
    database: Database;
}

/** Reads every file of the bundled ExpFlow template. */
export function readExpFlowTemplate(): TemplateFile[] {
    if (!fs.existsSync(EXPFLOW_TEMPLATE_DIR)) {
        throw new Error(`ExpFlow template not found at ${EXPFLOW_TEMPLATE_DIR}.`);
    }

    const files: TemplateFile[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const absolute = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(absolute);
                continue;
            }
            files.push({
                path: path.relative(EXPFLOW_TEMPLATE_DIR, absolute),
                content: fs.readFileSync(absolute, "utf-8"),
            });
        }
    };

    walk(EXPFLOW_TEMPLATE_DIR);
    return files;
}

/** Builds `.expflow/config.json` for the project that is being initialized. */
export function buildExpFlowConfig({ projectName, database }: ExpFlowConfigInput): string {
    const config = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        version: 1,
        project: {
            name: projectName,
            framework: "express",
            language: "typescript",
            architecture: "modular",
        },
        database: {
            provider: database,
        },
        validation: {
            tool: "zod",
        },
        workflow: {
            requireApprovalBeforeApply: true,
            requireVerificationBeforeArchive: true,
            allowQuickChanges: true,
        },
        commands: {
            propose: true,
            apply: true,
            verify: true,
            archive: true,
            sync: true,
        },
    };

    return `${JSON.stringify(config, null, 2)}\n`;
}

const DATABASE_LABELS: Record<Database, string> = {
    mongoose: "mongoose (MongoDB)",
    prisma: "prisma (PostgreSQL)",
};

const CORE_MODELS: Record<Database, Array<[name: string, source: string]>> = {
    prisma: [
        ["Account", "prisma/schema/account.schema.prisma"],
        ["Profile", "prisma/schema/profile.schema.prisma"],
        ["RefreshToken", "prisma/schema/account.schema.prisma"],
        ["SocialAccount", "prisma/schema/account.schema.prisma"],
        ["SocialLoginCode", "prisma/schema/account.schema.prisma"],
        ["RateLimit", "prisma/schema/account.schema.prisma"],
    ],
    mongoose: [
        ["account", "src/app/modules/account/account.schema.ts"],
        ["profile", "src/app/modules/profile/profile.schema.ts"],
        ["refresh_token", "src/app/modules/account/account.schema.ts"],
        ["social_account", "src/app/modules/account/account.schema.ts"],
        ["social_login_code", "src/app/modules/account/account.schema.ts"],
        ["rate_limit", "src/app/middlewares/rate_limiter.ts"],
    ],
};

/** Fills the tokens used by context documents for a specific project. */
export function renderTemplateContent(
    relative: string,
    content: string,
    { projectName, database }: ExpFlowConfigInput,
): string {
    let rendered = content
        .replaceAll("{{projectName}}", projectName)
        .replaceAll("{{database}}", database)
        .replaceAll("{{databaseLabel}}", DATABASE_LABELS[database])
        .replaceAll("{{databaseStore}}", database === "prisma" ? "PostgreSQL" : "MongoDB")
        .replaceAll(
            "{{queueBackend}}",
            database === "prisma" ? "pg-boss (PostgreSQL)" : "Agenda (MongoDB)",
        );

    if (path.normalize(relative) === path.normalize(SCHEMA_OVERVIEW_FILE)) {
        rendered = fillCoreModels(rendered, database);
    }
    return rendered;
}

function fillCoreModels(content: string, database: Database): string {
    const start = content.indexOf(MODELS_MARKER_START);
    const end = content.indexOf(MODELS_MARKER_END);
    if (start === -1 || end === -1 || end < start) return content;

    const modelLabel = database === "prisma" ? "Model" : "Collection";
    const rows = CORE_MODELS[database].map(([name, source]) => `| ${name} | ${source} |`);
    const block = [
        MODELS_MARKER_START,
        `| ${modelLabel} | Source |`,
        "| --- | --- |",
        ...rows,
        MODELS_MARKER_END,
    ].join("\n");

    return content.slice(0, start) + block + content.slice(end + MODELS_MARKER_END.length);
}

/** The project name from `package.json`, falling back to the folder name. */
export function readProjectName(cwd: string): string {
    const packageJson = path.join(cwd, "package.json");
    if (fs.existsSync(packageJson)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(packageJson, "utf-8")) as { name?: unknown };
            if (typeof parsed.name === "string" && parsed.name.trim()) return parsed.name.trim();
        } catch {
            // an invalid package.json must not block initialization
        }
    }
    return path.basename(path.resolve(cwd));
}

export interface AgentsMergeResult {
    content: string;
    /** Existing user content would have to be discarded (only without --force). */
    conflict: boolean;
    /** The content changed because an ExpFlow section was added or refreshed. */
    changed: boolean;
}

/**
 * Keeps an existing `AGENTS.md` intact. When the file exists without an
 * ExpFlow marker the managed block is appended; an existing managed block is
 * only refreshed with `--force`.
 */
export function mergeAgentsContent(existing: string | null, template: string, force = false): AgentsMergeResult {
    if (existing === null) return { content: template, conflict: false, changed: false };
    if (existing === template) return { content: existing, conflict: false, changed: false };

    const start = existing.indexOf(EXPFLOW_MARKER_START);
    const end = existing.indexOf(EXPFLOW_MARKER_END);

    if (start !== -1) {
        if (end === -1 || end < start) return { content: existing, conflict: true, changed: false };

        const currentBlock = existing.slice(start, end + EXPFLOW_MARKER_END.length);
        if (currentBlock.trimEnd() === template.trimEnd()) {
            return { content: existing, conflict: false, changed: false };
        }
        if (!force) return { content: existing, conflict: true, changed: false };

        const after = existing
            .slice(end + EXPFLOW_MARKER_END.length)
            .replace(/^\r?\n/, "");
        const updated = existing.slice(0, start) + template + after;
        return { content: updated, conflict: false, changed: updated !== existing };
    }

    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    return { content: `${existing}${separator}${template}`, conflict: false, changed: true };
}
