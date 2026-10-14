#!/usr/bin/env node
import { CliError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { run } from "./run.js";

try {
    await run(process.argv.slice(2));
} catch (err) {
    if (err instanceof CliError) {
        logger.error(err.message);
        process.exitCode = err.exitCode;
    } else if (err instanceof Error && err.name === "ExitPromptError") {
        // user pressed Ctrl+C at a prompt
        process.exitCode = 130;
    } else {
        logger.error("Unexpected error:");
        console.error(err);
        process.exitCode = 1;
    }
}
