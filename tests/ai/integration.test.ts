import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HELP, run } from "../../src/run.js";

let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "expflow-cli-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe("exp-node-server ai init", () => {
    it("scaffolds a project and initializes ExpFlow from the CLI", async () => {
        await run(["create", "demo", "--template", "prisma"], { cwd: tmp });
        const project = path.join(tmp, "demo");

        await run(["ai", "init"], { cwd: project });

        const config = JSON.parse(fs.readFileSync(path.join(project, ".expflow/config.json"), "utf-8"));
        expect(config.project.name).toBe("demo");
        expect(config.database.provider).toBe("prisma");
        expect(fs.existsSync(path.join(project, ".opencode/commands/propose.md"))).toBe(true);
        expect(fs.existsSync(path.join(project, ".agents/skills/propose/SKILL.md"))).toBe(true);
        expect(fs.readFileSync(path.join(project, "AGENTS.md"), "utf-8")).toContain("ExpFlow");
    });

    it("accepts --database when .projectrc.json is absent", async () => {
        await run(["ai", "init", "--database", "mongoose"], { cwd: tmp });

        const config = JSON.parse(fs.readFileSync(path.join(tmp, ".expflow/config.json"), "utf-8"));
        expect(config.database.provider).toBe("mongoose");
    });

    it("syncs context for a generated module", async () => {
        await run(["create", "demo", "--template", "prisma"], { cwd: tmp });
        const project = path.join(tmp, "demo");
        await run(["ai", "init"], { cwd: project });
        await run(["generate", "order"], { cwd: project });

        await run(["ai", "sync"], { cwd: project });
        expect(fs.existsSync(path.join(project, ".expflow/context/sync-report.md"))).toBe(true);
        expect(fs.existsSync(path.join(project, ".expflow/context/modules/order.md"))).toBe(false);

        await run(["ai", "sync", "--apply"], { cwd: project });
        expect(fs.existsSync(path.join(project, ".expflow/context/modules/order.md"))).toBe(true);
        expect(fs.readFileSync(path.join(project, ".expflow/context/modules.md"), "utf-8")).toContain(
            "| order |",
        );
    });

    it("advertises ai init in the help output", () => {
        expect(HELP).toContain("ai init");
        expect(HELP).toContain("ai sync");
        expect(HELP).toContain("--database");
        expect(HELP).toContain("--apply");
    });

    it.each([
        [["ai"], /ai requires a subcommand/],
        [["ai", "deploy"], /Unknown ai command 'deploy'/],
        [["ai", "init", "extra"], /Unexpected argument 'extra'/],
        [["ai", "init", "--database", "sqlite"], /Unknown database 'sqlite'/],
        [["ai", "init", "--template", "prisma"], /--template only applies to create/],
        [["ai", "init", "--auth"], /--auth only applies to generate/],
        [["ai", "init", "--apply"], /--apply only applies to ai sync/],
        [["ai", "sync", "--force"], /--force only applies to ai init or generate/],
        [["ai", "sync", "--database", "prisma"], /--database only applies to ai init/],
        [["create", "demo", "--database", "prisma"], /--database only applies to ai init/],
        [["create", "demo", "--apply"], /--apply only applies to ai sync/],
    ])("rejects %j", async (args, message) => {
        await expect(run(args, { cwd: tmp })).rejects.toThrow(message);
    });
});
