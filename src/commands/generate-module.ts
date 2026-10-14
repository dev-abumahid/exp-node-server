import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import { controllerGenerator } from "../generators/common/controller.js";
import { routeGenerator } from "../generators/common/route.js";
import { swaggerGenerator } from "../generators/common/swagger.js";
import { validationGenerator } from "../generators/common/validation.js";
import { interfaceGenerator } from "../generators/mongoose/interface.js";
import { schemaGenerator } from "../generators/mongoose/schema.js";
import { serviceGenerator } from "../generators/mongoose/service.js";
import { mongooseTestGenerator } from "../generators/mongoose/test.js";
import { prismaSchemaGenerator } from "../generators/prisma/schema.js";
import { prismaServiceGenerator } from "../generators/prisma/service.js";
import { prismaTestGenerator } from "../generators/prisma/test.js";
import { injectRoute } from "../injectors/route.js";
import type { InjectResult } from "../injectors/source.js";
import { injectSwagger } from "../injectors/swagger.js";
import { CliError } from "../lib/errors.js";
import { type FileSpec, writeFiles } from "../lib/fs.js";
import { logger } from "../lib/logger.js";
import { getProjectType } from "../lib/project-config.js";

export interface GenerateModuleOptions {
    /** Project root. Defaults to `process.cwd()`. */
    cwd?: string;
    /** Overwrite files if the module already exists. */
    force?: boolean;
}

export async function generateModule(
    name: string,
    { cwd = process.cwd(), force = false }: GenerateModuleOptions = {},
): Promise<void> {
    const type = getProjectType(cwd);
    const moduleDir = path.join(cwd, "src/app/modules", name);

    if (fs.existsSync(moduleDir) && !force) {
        throw new CliError(
            `Module '${name}' already exists at ${path.relative(cwd, moduleDir)}. Use --force to overwrite it.`,
        );
    }

    assertRoutePathFree(path.join(cwd, "src/routes.ts"), name);

    const file = (suffix: string, content: string): FileSpec => ({
        path: path.join(moduleDir, `${name}.${suffix}`),
        content,
    });

    const files: FileSpec[] = [
        file("controller.ts", controllerGenerator(name)),
        file("route.ts", routeGenerator(name)),
        file("validation.ts", validationGenerator(name)),
        file("swagger.ts", swaggerGenerator(name)),
    ];

    if (type === "mongoose") {
        files.push(
            file("interface.ts", interfaceGenerator(name)),
            file("schema.ts", schemaGenerator(name)),
            file("service.ts", serviceGenerator(name)),
        );
    } else {
        files.push(file("service.ts", prismaServiceGenerator(name)), {
            path: path.join(cwd, "prisma/schema", `${name}.prisma`),
            content: prismaSchemaGenerator(name),
        });
    }

    // route tests, for projects that have the test setup (older ones don't)
    const testFile = path.join(cwd, "tests/routes", `${name}.test.ts`);
    const hasTestSetup = TEST_CONFIGS.some((f) => fs.existsSync(path.join(cwd, f)));
    if (hasTestSetup) {
        files.push({
            path: testFile,
            content: type === "mongoose" ? mongooseTestGenerator(name) : prismaTestGenerator(name),
        });
    }

    writeFiles(files, cwd);
    if (!hasTestSetup) {
        logger.info(chalk.dim("  no vitest config found, skipped tests/routes test"));
    }

    applyInjection(path.join(cwd, "src/routes.ts"), (c) => injectRoute(c, name), "Route registered");
    applyInjection(
        path.join(cwd, "src/swaggerOptions.ts"),
        (c) => injectSwagger(c, name),
        "Swagger docs registered",
    );

    if (type === "prisma") {
        logger.info(chalk.blue("\nNext, run:"));
        logger.info(chalk.yellow("  npx prisma generate && npx prisma migrate dev"));
    }
    if (hasTestSetup) {
        logger.info(chalk.blue(`\nTest it with: npm test -- tests/routes/${name}.test.ts`));
    }

    logger.info(chalk.green(`\nModule '${name}' created successfully`));
}

const TEST_CONFIGS = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js"];

/**
 * Refuses a module whose URL is already taken by another router, e.g. `-g auth`
 * next to the template's account routes mounted at `/auth`.
 */
function assertRoutePathFree(routesFile: string, name: string): void {
    if (!fs.existsSync(routesFile)) return;
    const content = fs.readFileSync(routesFile, "utf-8");
    const taken = new RegExp(`path:\\s*['"]/${name}['"]\\s*,\\s*route:\\s*(\\w+)`).exec(content);
    if (taken && taken[1] !== `${name}Route`) {
        throw new CliError(
            `The path '/${name}' is already used by ${taken[1]} in src/routes.ts. Pick another module name.`,
        );
    }
}

function applyInjection(
    filePath: string,
    inject: (content: string) => InjectResult,
    successMessage: string,
): void {
    const fileName = path.basename(filePath);

    if (!fs.existsSync(filePath)) {
        logger.warn(`${fileName} not found, skipping registration`);
        return;
    }

    const result = inject(fs.readFileSync(filePath, "utf-8"));

    switch (result.status) {
        case "updated":
            fs.writeFileSync(filePath, result.content);
            logger.success(`${successMessage} in ${fileName}`);
            break;
        case "unchanged":
            logger.info(chalk.dim(`  already registered in ${fileName}`));
            break;
        case "failed":
            logger.warn(`Couldn't update ${fileName} (${result.reason}). Register it manually.`);
            break;
    }
}
