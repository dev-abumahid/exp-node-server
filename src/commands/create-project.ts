import select from "@inquirer/select";
import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import ora from "ora";
import { CliError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { TEMPLATES_DIR } from "../lib/paths.js";
import type { Database } from "../lib/project-config.js";

export interface CreateProjectOptions {
    /** Skip the interactive prompt. */
    template?: Database | undefined;
    /** Directory to create the project in. Defaults to `process.cwd()`. */
    cwd?: string;
}

/**
 * npm drops `.gitignore` files when publishing, so templates ship them as
 * `_gitignore` and we rename them after copying.
 */
const RENAMED_FILES: Record<string, string> = {
    _gitignore: ".gitignore",
};

/** Local artifacts in a template folder that must never end up in a new project. */
const SKIPPED = new Set(["node_modules", "dist", "coverage", ".env"]);

export async function createProject(
    projectName: string,
    { template, cwd = process.cwd() }: CreateProjectOptions = {},
): Promise<void> {
    const targetDir = path.join(cwd, projectName);

    if (fs.existsSync(targetDir)) {
        throw new CliError(`Folder '${projectName}' already exists.`);
    }

    const selected = template ?? (await promptTemplate());
    const templateDir = path.join(TEMPLATES_DIR, selected);

    if (!fs.existsSync(templateDir)) {
        throw new CliError(`Template '${selected}' not found at ${templateDir}.`);
    }

    const spinner = ora(`Creating ${selected} project...`).start();

    try {
        await fs.promises.cp(templateDir, targetDir, {
            recursive: true,
            filter: (src) => !SKIPPED.has(path.basename(src)),
        });

        for (const [from, to] of Object.entries(RENAMED_FILES)) {
            const src = path.join(targetDir, from);
            if (fs.existsSync(src)) await fs.promises.rename(src, path.join(targetDir, to));
        }

        await setPackageName(targetDir, projectName);
    } catch (err) {
        spinner.fail("Failed to create project");
        // don't leave a half-copied project behind
        await fs.promises.rm(targetDir, { recursive: true, force: true });
        throw err;
    }

    spinner.succeed(`Project '${projectName}' created`);

    logger.info(chalk.green("\nNext steps:"));
    logger.info(chalk.cyan(`  cd ${projectName}`));
    logger.info(chalk.cyan("  npm install"));
    logger.info(chalk.cyan("  cp .env.example .env    # then fill in the secrets"));
    logger.info(chalk.cyan("  docker compose up -d    # starts the database"));
    if (selected === "prisma") {
        logger.info(chalk.cyan("  npm run db:migrate"));
    }
    logger.info(chalk.cyan("  npm run dev"));
    logger.info(chalk.cyan("  npm test"));
}

async function promptTemplate(): Promise<Database> {
    return select<Database>({
        message: "Select a project template:",
        choices: [
            { name: "Mongoose (MongoDB)", value: "mongoose" },
            { name: "Prisma (PostgreSQL)", value: "prisma" },
        ],
    });
}

async function setPackageName(dir: string, name: string): Promise<void> {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) return;

    const pkg = JSON.parse(await fs.promises.readFile(pkgPath, "utf-8")) as Record<string, unknown>;
    pkg.name = name;
    await fs.promises.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

    // the lockfile repeats the name (top level and the root package entry)
    const lockPath = path.join(dir, "package-lock.json");
    if (!fs.existsSync(lockPath)) return;

    const lock = JSON.parse(await fs.promises.readFile(lockPath, "utf-8")) as {
        name?: string;
        packages?: Record<string, { name?: string }>;
    };
    lock.name = name;
    const root = lock.packages?.[""];
    if (root) root.name = name;
    await fs.promises.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
