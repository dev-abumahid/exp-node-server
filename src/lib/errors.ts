/**
 * An expected, user-facing failure. The CLI prints only the message
 * (no stack trace) and exits with `exitCode`.
 */
export class CliError extends Error {
    readonly exitCode: number;

    constructor(message: string, exitCode = 1) {
        super(message);
        this.name = "CliError";
        this.exitCode = exitCode;
    }
}
