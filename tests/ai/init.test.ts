import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAIWorkflow } from "../../src/commands/ai/init.js";
import { CliError } from "../../src/lib/errors.js";

let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "expflow-init-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
});

function scaffold(database: "mongoose" | "prisma" = "prisma", name = "demo-api"): void {
    fs.writeFileSync(path.join(tmp, ".projectrc.json"), JSON.stringify({ database }));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ name }));
}

const read = (file: string) => fs.readFileSync(path.join(tmp, file), "utf-8");
const exists = (file: string) => fs.existsSync(path.join(tmp, file));

describe("initAIWorkflow", () => {
    it("installs the complete ExpFlow structure", async () => {
        scaffold("prisma", "referral-api");

        const result = await initAIWorkflow({ cwd: tmp });

        const expected = [
            ".expflow/config.json",
            ".expflow/rules/backend.md",
            ".expflow/workflows/propose.md",
            ".expflow/workflows/apply.md",
            ".expflow/workflows/verify.md",
            ".expflow/workflows/archive.md",
            ".expflow/changes/.gitkeep",
            ".opencode/commands/propose.md",
            ".opencode/commands/apply.md",
            ".opencode/commands/verify.md",
            ".opencode/commands/archive.md",
            ".agents/skills/propose/SKILL.md",
            ".agents/skills/apply/SKILL.md",
            ".agents/skills/verify/SKILL.md",
            ".agents/skills/archive/SKILL.md",
            "AGENTS.md",
        ];

        for (const file of expected) expect(exists(file), file).toBe(true);
        expect(result.created).toEqual(expect.arrayContaining(expected));
        expect(result.conflicts).toEqual([]);
    });

    it("writes the detected project name and database into the config", async () => {
        scaffold("mongoose", "my-api");

        await initAIWorkflow({ cwd: tmp });

        const config = JSON.parse(read(".expflow/config.json"));
        expect(config.project.name).toBe("my-api");
        expect(config.database.provider).toBe("mongoose");
        expect(config.validation.tool).toBe("zod");
        expect(config.workflow.requireApprovalBeforeApply).toBe(true);
    });

    it("is idempotent", async () => {
        scaffold();
        await initAIWorkflow({ cwd: tmp });

        const second = await initAIWorkflow({ cwd: tmp });

        expect(second.created).toEqual([]);
        expect(second.updated).toEqual([]);
        expect(second.conflicts).toEqual([]);
    });

    it("detects the database from an existing ExpFlow config", async () => {
        fs.mkdirSync(path.join(tmp, ".expflow"), { recursive: true });
        fs.writeFileSync(
            path.join(tmp, ".expflow/config.json"),
            JSON.stringify({ database: { provider: "mongoose" } }),
        );

        const result = await initAIWorkflow({ cwd: tmp, force: true });

        const config = JSON.parse(read(".expflow/config.json"));
        expect(config.database.provider).toBe("mongoose");
        expect(config.project.name).toBe(path.basename(tmp));
        expect(result.conflicts).not.toContain(".expflow/config.json");
    });

    it("requires a database when the project cannot be detected", async () => {
        await expect(initAIWorkflow({ cwd: tmp })).rejects.toThrow(CliError);
        await expect(initAIWorkflow({ cwd: tmp })).rejects.toThrow(/--database/);

        await initAIWorkflow({ cwd: tmp, database: "mongoose" });
        expect(JSON.parse(read(".expflow/config.json")).database.provider).toBe("mongoose");
    });

    it("appends ExpFlow rules to an existing AGENTS.md without losing user content", async () => {
        scaffold();
        fs.writeFileSync(path.join(tmp, "AGENTS.md"), "# My Rules\n\nUse tabs.\n");

        const result = await initAIWorkflow({ cwd: tmp });
        const agents = read("AGENTS.md");

        expect(agents).toContain("# My Rules");
        expect(agents).toContain("Use tabs.");
        expect(agents).toContain("<!-- expflow:start -->");
        expect(agents).toContain("ExpFlow Engineering Rules");
        expect(result.updated).toContain("AGENTS.md");
    });

    it("keeps a conflicting managed block until --force is used", async () => {
        scaffold();
        fs.writeFileSync(
            path.join(tmp, "AGENTS.md"),
            "# Mine\n<!-- expflow:start -->\nold rules\n<!-- expflow:end -->\n",
        );

        const result = await initAIWorkflow({ cwd: tmp });
        expect(result.conflicts).toContain("AGENTS.md");
        expect(read("AGENTS.md")).toContain("old rules");

        await initAIWorkflow({ cwd: tmp, force: true });
        expect(read("AGENTS.md")).toContain("# Mine");
        expect(read("AGENTS.md")).toContain("ExpFlow Engineering Rules");
        expect(read("AGENTS.md")).not.toContain("old rules");
    });

    it("stays idempotent when it merged into an existing AGENTS.md", async () => {
        scaffold();
        fs.writeFileSync(path.join(tmp, "AGENTS.md"), "# Mine\n");

        await initAIWorkflow({ cwd: tmp });
        const second = await initAIWorkflow({ cwd: tmp });

        expect(second.conflicts).toEqual([]);
        expect(second.created).toEqual([]);
        expect(second.updated).toEqual([]);
        expect(read("AGENTS.md")).toContain("# Mine");
    });

    it("does not overwrite a conflicting agent command without --force", async () => {
        scaffold();
        await initAIWorkflow({ cwd: tmp });

        const command = path.join(tmp, ".opencode/commands/propose.md");
        fs.writeFileSync(command, "---\ndescription: my own command\n---\n");

        const result = await initAIWorkflow({ cwd: tmp });

        expect(result.conflicts).toContain(".opencode/commands/propose.md");
        expect(fs.readFileSync(command, "utf-8")).toBe("---\ndescription: my own command\n---\n");
    });

    it("backs up managed files when --force replaces them", async () => {
        scaffold();
        await initAIWorkflow({ cwd: tmp });

        const command = path.join(tmp, ".opencode/commands/propose.md");
        const custom = "---\ndescription: my own command\n---\n";
        fs.writeFileSync(command, custom);

        const result = await initAIWorkflow({ cwd: tmp, force: true });

        expect(fs.readFileSync(command, "utf-8")).toContain("Read and follow `.expflow/workflows/propose.md`.");
        expect(result.backupDir).not.toBeNull();

        const backups = path.dirname(result.backupDir!);
        const [run] = fs.readdirSync(backups);
        const saved = path.join(backups, run!, ".opencode/commands/propose.md");
        expect(fs.readFileSync(saved, "utf-8")).toBe(custom);
    });

    it("never touches user change artifacts", async () => {
        scaffold();
        await initAIWorkflow({ cwd: tmp });

        const proposal = path.join(tmp, ".expflow/changes/my-feature/proposal.md");
        fs.mkdirSync(path.dirname(proposal), { recursive: true });
        fs.writeFileSync(proposal, "# my proposal\n");

        await initAIWorkflow({ cwd: tmp, force: true });

        expect(fs.readFileSync(proposal, "utf-8")).toBe("# my proposal\n");
    });

    it("uses the folder name when package.json has no name", async () => {
        fs.writeFileSync(path.join(tmp, ".projectrc.json"), JSON.stringify({ database: "prisma" }));

        await initAIWorkflow({ cwd: tmp });

        expect(JSON.parse(read(".expflow/config.json")).project.name).toBe(path.basename(tmp));
    });
});
