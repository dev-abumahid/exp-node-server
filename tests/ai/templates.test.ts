import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildExpFlowConfig,
    EXPFLOW_TEMPLATE_DIR,
    mergeAgentsContent,
} from "../../src/utils/ai-template.js";

const read = (file: string) => fs.readFileSync(path.join(EXPFLOW_TEMPLATE_DIR, file), "utf-8");

const workflows = ["propose", "apply", "verify", "archive"] as const;

describe("ExpFlow template", () => {
    it.each(workflows)("ships the %s workflow", (name) => {
        const content = read(`.expflow/workflows/${name}.md`);
        expect(content).toContain(`# ${name.toUpperCase()} WORKFLOW`);
        expect(content.trim().length).toBeGreaterThan(100);
    });

    it.each(workflows)("ships the %s OpenCode command", (name) => {
        const content = read(`.opencode/commands/${name}.md`);
        expect(content).toMatch(/^---\ndescription: /);
        expect(content).toContain(`\`.expflow/workflows/${name}.md\``);
        expect(content).toContain("$ARGUMENTS");
    });

    it.each(workflows)("ships the %s Antigravity skill", (name) => {
        const content = read(`.agents/skills/${name}/SKILL.md`);
        expect(content).toMatch(new RegExp(`^---\\nname: ${name}\\ndescription: `));
        expect(content).toContain(`\`.expflow/workflows/${name}.md\``);
    });

    it("ships a valid config with the expected workflow gates", () => {
        const config = JSON.parse(read(".expflow/config.json"));

        expect(config.version).toBe(1);
        expect(config.project.framework).toBe("express");
        expect(config.project.language).toBe("typescript");
        expect(config.validation.tool).toBe("zod");
        expect(config.workflow).toMatchObject({
            requireApprovalBeforeApply: true,
            requireVerificationBeforeArchive: true,
            allowQuickChanges: true,
        });
        expect(config.commands).toEqual({
            propose: true,
            apply: true,
            verify: true,
            archive: true,
        });
    });

    it("keeps backend rules and global instructions linked", () => {
        const rules = read(".expflow/rules/backend.md");
        const agents = read("AGENTS.md");

        expect(rules).toContain("## Architecture");
        expect(rules).toContain("## Security");
        expect(rules).toContain("## Testing");
        expect(agents).toContain(".expflow/config.json");
        expect(agents).toContain(".expflow/rules/backend.md");
        expect(agents).toContain("/propose");
        expect(agents).toContain("/verify");
        expect(agents).toContain("<!-- expflow:start -->");
        expect(agents).toContain("<!-- expflow:end -->");
    });

    it("never tells propose, verify or archive to edit source code", () => {
        expect(read(".expflow/workflows/propose.md")).toContain("Never modify source code");
        expect(read(".expflow/workflows/verify.md")).toContain("Do not modify source code");
        expect(read(".expflow/workflows/archive.md")).toContain("Do not modify source code");
    });

    it("requires verification before archiving", () => {
        const content = read(".expflow/workflows/archive.md");
        expect(content).toContain("status: passed");
        expect(content).toContain("Do not archive failed or partial changes");
    });
});

describe("buildExpFlowConfig", () => {
    it("puts the project name and database into the config", () => {
        const config = JSON.parse(buildExpFlowConfig({ projectName: "shop-api", database: "mongoose" }));

        expect(config.project.name).toBe("shop-api");
        expect(config.database.provider).toBe("mongoose");
        expect(buildExpFlowConfig({ projectName: "x", database: "prisma" }).endsWith("\n")).toBe(true);
    });
});

describe("mergeAgentsContent", () => {
    const template = "<!-- expflow:start -->\nnew\n<!-- expflow:end -->\n";

    it("uses the template when the file does not exist", () => {
        expect(mergeAgentsContent(null, template)).toEqual({ content: template, conflict: false, changed: false });
    });

    it("appends to existing user content", () => {
        const result = mergeAgentsContent("# Mine\n", template);
        expect(result.conflict).toBe(false);
        expect(result.changed).toBe(true);
        expect(result.content).toContain("# Mine");
        expect(result.content).toContain("<!-- expflow:start -->");
    });

    it("keeps an existing managed block without --force", () => {
        const existing = "# Mine\n<!-- expflow:start -->\nold\n<!-- expflow:end -->\n";
        const result = mergeAgentsContent(existing, template);

        expect(result).toEqual({ content: existing, conflict: true, changed: false });
    });

    it("treats an identical managed block as unchanged", () => {
        const existing = `# Mine\n${template}`;
        expect(mergeAgentsContent(existing, template)).toEqual({
            content: existing,
            conflict: false,
            changed: false,
        });
    });

    it("refreshes an existing managed block with --force", () => {
        const existing = "# Mine\n<!-- expflow:start -->\nold\n<!-- expflow:end -->\n";
        const result = mergeAgentsContent(existing, template, true);

        expect(result.conflict).toBe(false);
        expect(result.changed).toBe(true);
        expect(result.content).toBe("# Mine\n<!-- expflow:start -->\nnew\n<!-- expflow:end -->\n");
    });

    it("reports an unclosed managed block as a conflict", () => {
        const result = mergeAgentsContent("# Mine\n<!-- expflow:start -->\nold\n", template);
        expect(result.conflict).toBe(true);
    });
});
