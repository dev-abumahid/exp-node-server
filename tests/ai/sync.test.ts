import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initAIWorkflow } from "../../src/commands/ai/init.js";
import { createProject } from "../../src/commands/create-project.js";
import { generateModule } from "../../src/commands/generate-module.js";
import { CliError } from "../../src/lib/errors.js";
import { scanProject, syncContext } from "../../src/utils/context-sync.js";
import type { Database } from "../../src/lib/project-config.js";

let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "expflow-sync-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
});

const read = (project: string, file: string) => fs.readFileSync(path.join(project, file), "utf-8");

async function setup(database: Database = "prisma"): Promise<string> {
    await createProject("demo", { template: database, cwd: tmp });
    const project = path.join(tmp, "demo");
    await initAIWorkflow({ cwd: project });
    return project;
}

describe("ai sync", () => {
    it("refuses to run before ai init", () => {
        expect(() => syncContext({ cwd: tmp })).toThrow(CliError);
        expect(() => syncContext({ cwd: tmp })).toThrow(/ai init/);
    });

    it("detects a module that is missing context", async () => {
        const project = await setup("prisma");
        await generateModule("order", { cwd: project });

        const result = syncContext({ cwd: project });

        expect(result.inSync).toBe(false);
        expect(result.modules.map((module) => module.name)).toContain("order");
        const order = result.modules.find((module) => module.name === "order")!;
        expect(order.route).toBe("/api/order");
        expect(order.contextStatus).toBe("missing");
        expect(fs.existsSync(path.join(project, ".expflow/context/sync-report.md"))).toBe(true);
        expect(fs.existsSync(path.join(project, ".expflow/context/modules/order.md"))).toBe(false);

        const report = read(project, ".expflow/context/sync-report.md");
        expect(report).toContain("drift detected");
        expect(report).toContain("modules/order.md");
    });

    it("applies the registry, model list and a missing context stub", async () => {
        const project = await setup("prisma");
        await generateModule("order", { cwd: project });

        const result = syncContext({ cwd: project, apply: true });

        expect(result.applied).toBe(true);
        expect(result.created).toContain(".expflow/context/modules/order.md");
        expect(result.updated).toContain(".expflow/context/modules.md");

        const stub = read(project, ".expflow/context/modules/order.md");
        expect(stub).toContain("<!-- expflow:stub -->");
        expect(stub).toContain("Status: Needs context");
        expect(stub).toContain("/api/order");

        const registry = read(project, ".expflow/context/modules.md");
        expect(registry).toContain("| order | Implemented | /api/order | modules/order.md |");

        const schema = read(project, ".expflow/context/database/schema-overview.md");
        expect(schema).toContain("| Order | prisma/schema/order.prisma |");
    });

    it("reports a generated stub as still needing context", async () => {
        const project = await setup("prisma");
        await generateModule("order", { cwd: project });
        syncContext({ cwd: project, apply: true });

        const result = syncContext({ cwd: project });

        expect(result.inSync).toBe(false);
        expect(result.modules.find((module) => module.name === "order")?.contextStatus).toBe("stub");
    });

    it("preserves user text outside the managed registry block", async () => {
        const project = await setup("prisma");
        await generateModule("order", { cwd: project });

        const registryFile = path.join(project, ".expflow/context/modules.md");
        fs.appendFileSync(registryFile, "\nMy custom note.\n");

        syncContext({ cwd: project, apply: true });

        expect(fs.readFileSync(registryFile, "utf-8")).toContain("My custom note.");
        expect(fs.readFileSync(registryFile, "utf-8")).toContain("| order |");
    });

    it("never overwrites an existing module context", async () => {
        const project = await setup("prisma");
        await generateModule("order", { cwd: project });
        const contextFile = path.join(project, ".expflow/context/modules/order.md");
        fs.writeFileSync(contextFile, "# Order\n\nMy verified notes.\n");

        syncContext({ cwd: project, apply: true });

        expect(fs.readFileSync(contextFile, "utf-8")).toBe("# Order\n\nMy verified notes.\n");
    });

    it("detects orphan context documents", async () => {
        const project = await setup("prisma");
        fs.writeFileSync(path.join(project, ".expflow/context/modules/legacy.md"), "# Legacy\n");

        const result = scanProject(project);

        expect(result.inSync).toBe(false);
        expect(result.orphanContexts).toEqual([".expflow/context/modules/legacy.md"]);
    });

    it("detects Mongoose models", async () => {
        const project = await setup("mongoose");
        await generateModule("order", { cwd: project });

        const result = scanProject(project);
        const names = result.models.map((model) => model.name);

        expect(names).toContain("order");
        expect(names).toContain("account");
        expect(result.models.find((model) => model.name === "order")?.source).toBe(
            "src/app/modules/order/order.schema.ts",
        );
    });

    it("reports an in-sync context after the stubs are filled in", async () => {
        const project = await setup("prisma");
        await generateModule("order", { cwd: project });
        syncContext({ cwd: project, apply: true });

        const contextFile = path.join(project, ".expflow/context/modules/order.md");
        fs.writeFileSync(
            contextFile,
            "# Order Module\n\nStatus: Documented\n\n## Capabilities\n\n- CRUD for orders\n",
        );

        const result = syncContext({ cwd: project });

        expect(result.inSync).toBe(true);
        expect(result.modules.find((module) => module.name === "order")?.contextStatus).toBe("documented");
    });
});
