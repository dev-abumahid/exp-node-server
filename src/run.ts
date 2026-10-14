import chalk from "chalk";
import { parseArgs } from "node:util";
import { createProject } from "./commands/create-project.js";
import { generateModule } from "./commands/generate-module.js";
import { CliError } from "./lib/errors.js";
import { DATABASES, isDatabase } from "./lib/project-config.js";
import { validateModuleName, validateProjectName } from "./lib/validators.js";

const BIN = "exp-node-server";

export const HELP = `
${chalk.bold(BIN)} - scaffold Express + TypeScript APIs with Mongoose or Prisma

${chalk.bold("Usage")}
  npx ${BIN} create <project-name> [--template <mongoose|prisma>]
  npx ${BIN} generate <module-name> [--auth] [--force]

${chalk.bold("Commands")}
  create, -c <name>      Create a new project from a template
  generate, -g <name>    Generate a module in the current project

${chalk.bold("Options")}
  -t, --template <name>  Template to use with create (${DATABASES.join(" | ")})
  -a, --auth             Generated routes require a signed-in user (default: public)
  -f, --force            Overwrite an existing module when generating
  -h, --help             Show this help
  -v, --version          Show version

${chalk.bold("Examples")}
  npx ${BIN} -c my-api
  npx ${BIN} create my-api --template prisma
  npx ${BIN} -g order
  npx ${BIN} -g order --auth
`;

type Command = { kind: "create"; name: string | undefined } | { kind: "generate"; name: string | undefined };

/** Parses argv and runs the requested command. Throws `CliError` on bad input. */
export async function run(argv: string[]): Promise<void> {
    const { values, positionals } = parse(argv);

    if (values.version) {
        console.log(__VERSION__);
        return;
    }

    const command = resolveCommand(values, positionals);

    if (values.help || !command) {
        console.log(HELP);
        return;
    }

    if (command.kind === "create") {
        if (values.auth || values.force) {
            throw new CliError("--auth and --force only apply to generate.");
        }
        const projectName = validateProjectName(command.name);
        if (!projectName) {
            throw new CliError(
                command.name
                    ? `Invalid project name '${command.name}'. Use letters, numbers and dashes.`
                    : "Project name required. Example: exp-node-server -c my-api",
            );
        }

        const { template } = values;
        if (template !== undefined && !isDatabase(template)) {
            throw new CliError(`Unknown template '${template}'. Use one of: ${DATABASES.join(", ")}.`);
        }

        await createProject(projectName, { template });
        return;
    }

    const moduleName = validateModuleName(command.name);
    if (!moduleName) {
        throw new CliError(
            command.name
                ? `Invalid module name '${command.name}'. Use letters and underscores, starting with a letter.`
                : "Module name required. Example: exp-node-server -g order",
        );
    }

    await generateModule(moduleName, { force: values.force ?? false, auth: values.auth ?? false });
}

function parse(argv: string[]) {
    try {
        return parseArgs({
            args: argv,
            allowPositionals: true,
            strict: true,
            options: {
                create: { type: "string", short: "c" },
                generate: { type: "string", short: "g" },
                template: { type: "string", short: "t" },
                force: { type: "boolean", short: "f" },
                auth: { type: "boolean", short: "a" },
                help: { type: "boolean", short: "h" },
                version: { type: "boolean", short: "v" },
            },
        });
    } catch (err) {
        // parseArgs throws TypeErrors with readable messages for bad flags
        const message = err instanceof Error ? err.message : String(err);
        throw new CliError(`${message}\nRun '${BIN} --help' for usage.`);
    }
}

function resolveCommand(
    values: { create?: string | undefined; generate?: string | undefined },
    positionals: string[],
): Command | null {
    if (values.create !== undefined && values.generate !== undefined) {
        throw new CliError("Use either -c (create) or -g (generate), not both.");
    }
    if ((values.create !== undefined || values.generate !== undefined) && positionals.length > 0) {
        throw new CliError(`Unexpected argument '${positionals[0]}'. Run '${BIN} --help' for usage.`);
    }
    if (values.create !== undefined) return { kind: "create", name: values.create };
    if (values.generate !== undefined) return { kind: "generate", name: values.generate };

    const [sub, name, ...extra] = positionals;
    if (sub === undefined) return null;
    if (extra.length > 0) {
        throw new CliError(`Unexpected argument '${extra[0]}'. Run '${BIN} --help' for usage.`);
    }

    switch (sub) {
        case "create":
        case "c":
            return { kind: "create", name };
        case "generate":
        case "g":
            return { kind: "generate", name };
        default:
            throw new CliError(`Unknown command '${sub}'. Run '${BIN} --help' for usage.`);
    }
}
