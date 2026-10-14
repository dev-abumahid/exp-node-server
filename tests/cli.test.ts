import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "dist/cli.js");

const runCli = (args: string[], cwd = root) =>
    spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf-8", env: { ...process.env, NO_COLOR: "1" } });

// end-to-end tests against the bundled output
beforeAll(() => {
    execFileSync("npx", ["tsup", "--silent"], { cwd: root, stdio: "inherit" });
}, 60_000);

describe("cli (bundled)", () => {
    it("starts with a shebang", () => {
        expect(fs.readFileSync(cli, "utf-8").startsWith("#!/usr/bin/env node")).toBe(true);
    });

    it("prints help with no args", () => {
        const r = runCli([]);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("Usage");
    });

    it("prints the package version", () => {
        const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
        expect(runCli(["--version"]).stdout.trim()).toBe(version);
    });

    it.each([
        [["-x"], /Unknown option '-x'/],
        [["-c"], /argument missing/],
        [["-c", "bad_name!"], /Invalid project name/],
        [["-g", "1abc"], /Invalid module name/],
        [["deploy"], /Unknown command 'deploy'/],
        [["-c", "a", "-t", "sqlite"], /Unknown template 'sqlite'/],
    ])("fails cleanly for %j", (args, message) => {
        const r = runCli(args);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(message);
        expect(r.stderr).not.toMatch(/\n\s+at /); // no stack trace
    });

    it("creates a project and generates a module", () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exp-node-server-cli-"));
        try {
            expect(runCli(["create", "demo", "--template", "prisma"], tmp).status).toBe(0);
            const project = path.join(tmp, "demo");
            const r = runCli(["-g", "order"], project);
            expect(r.status).toBe(0);
            expect(fs.existsSync(path.join(project, "src/app/modules/order/order.service.ts"))).toBe(true);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
