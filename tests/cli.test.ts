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

    it("initializes the ExpFlow workflow in a generated project", () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exp-node-server-expflow-"));
        try {
            expect(runCli(["create", "ai-demo", "--template", "mongoose"], tmp).status).toBe(0);
            const project = path.join(tmp, "ai-demo");

            const r = runCli(["ai", "init"], project);
            expect(r.status).toBe(0);

            const config = JSON.parse(fs.readFileSync(path.join(project, ".expflow/config.json"), "utf-8"));
            expect(config.project.name).toBe("ai-demo");
            expect(config.database.provider).toBe("mongoose");
            expect(fs.existsSync(path.join(project, ".opencode/commands/propose.md"))).toBe(true);
            expect(fs.existsSync(path.join(project, ".opencode/commands/sync.md"))).toBe(true);
            expect(fs.existsSync(path.join(project, ".agents/skills/verify/SKILL.md"))).toBe(true);
            expect(fs.existsSync(path.join(project, ".expflow/context/modules.md"))).toBe(true);

            const synced = runCli(["ai", "sync"], project);
            expect(synced.status).toBe(0);
            expect(fs.existsSync(path.join(project, ".expflow/context/sync-report.md"))).toBe(true);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
