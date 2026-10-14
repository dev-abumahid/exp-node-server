import fs from "node:fs";
import path from "node:path";
import { CliError } from "./errors.js";

export const DATABASES = ["mongoose", "prisma"] as const;
export type Database = (typeof DATABASES)[number];

export const PROJECT_CONFIG_FILE = ".projectrc.json";

export const isDatabase = (value: unknown): value is Database =>
    typeof value === "string" && (DATABASES as readonly string[]).includes(value);

/** Reads the database type from the project's `.projectrc.json`. */
export function getProjectType(cwd: string): Database {
    const configPath = path.join(cwd, PROJECT_CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
        throw new CliError(
            `${PROJECT_CONFIG_FILE} not found. Run this command from the root of a project created with exp-node-server.`,
        );
    }

    let config: unknown;
    try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
        throw new CliError(`${PROJECT_CONFIG_FILE} is not valid JSON.`);
    }

    const database = (config as { database?: unknown } | null)?.database;
    if (!isDatabase(database)) {
        throw new CliError(
            `Invalid "database" in ${PROJECT_CONFIG_FILE}. Expected one of: ${DATABASES.join(", ")}.`,
        );
    }

    return database;
}
