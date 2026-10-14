import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject } from "../src/commands/create-project.js";
import { generateModule } from "../src/commands/generate-module.js";
import { CliError } from "../src/lib/errors.js";
import { run } from "../src/run.js";
import type { Database } from "../src/lib/project-config.js";

let tmp: string;

beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exp-node-server-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe.each<Database>(["mongoose", "prisma"])("%s", (template) => {
    it("creates a project and generates a module in it", async () => {
        await createProject("my-api", { template, cwd: tmp });
        const project = path.join(tmp, "my-api");

        expect(fs.existsSync(path.join(project, ".gitignore"))).toBe(true);
        expect(fs.existsSync(path.join(project, "_gitignore"))).toBe(false);
        // uploads stream to Cloudinary, nothing is stored on disk
        expect(fs.existsSync(path.join(project, "uploads"))).toBe(false);
        expect(JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf-8")).name).toBe("my-api");
        // local artifacts of the template folder are never copied
        for (const artifact of ["node_modules", "dist", "coverage", ".env"]) {
            expect(fs.existsSync(path.join(project, artifact)), artifact).toBe(false);
        }

        await generateModule("order", { cwd: project });

        const moduleDir = path.join(project, "src/app/modules/order");
        const expected = ["controller", "route", "validation", "swagger", "service"];
        if (template === "mongoose") expected.push("interface", "schema");
        for (const kind of expected) {
            expect(fs.existsSync(path.join(moduleDir, `order.${kind}.ts`)), kind).toBe(true);
        }

        // a route test next to the template's own route tests
        const test = fs.readFileSync(path.join(project, "tests/routes/order.test.ts"), "utf-8");
        expect(test).toContain("const BASE = '/api/order';");
        expect(test).toContain(template === "mongoose" ? "order_model" : "prismaMock.order");

        if (template === "prisma") {
            const schema = fs.readFileSync(path.join(project, "prisma/schema/order.prisma"), "utf-8");
            expect(schema).toContain("model Order {");
        }

        expect(fs.readFileSync(path.join(project, "src/routes.ts"), "utf-8")).toContain("orderRoute");
        expect(fs.readFileSync(path.join(project, "src/swaggerOptions.ts"), "utf-8")).toContain("...orderSwaggerDocs");
    });
});

describe("createProject", () => {
    it("names the project in package.json and the lockfile", async () => {
        await createProject("my-api", { template: "prisma", cwd: tmp });
        const lock = JSON.parse(fs.readFileSync(path.join(tmp, "my-api/package-lock.json"), "utf-8"));

        expect(lock.name).toBe("my-api");
        expect(lock.packages[""].name).toBe("my-api");
    });

    it("refuses to overwrite an existing folder", async () => {
        fs.mkdirSync(path.join(tmp, "my-api"));
        await expect(createProject("my-api", { template: "mongoose", cwd: tmp })).rejects.toThrow(CliError);
    });
});

describe("generateModule", () => {
    it("fails outside a project", async () => {
        await expect(generateModule("order", { cwd: tmp })).rejects.toThrow(/\.projectrc\.json not found/);
    });

    it("rejects an unknown database type", async () => {
        fs.writeFileSync(path.join(tmp, ".projectrc.json"), JSON.stringify({ database: "sqlite" }));
        await expect(generateModule("order", { cwd: tmp })).rejects.toThrow(/Invalid "database"/);
    });

    it("refuses to overwrite an existing module unless forced", async () => {
        await createProject("my-api", { template: "mongoose", cwd: tmp });
        const project = path.join(tmp, "my-api");
        await generateModule("order", { cwd: project });

        await expect(generateModule("order", { cwd: project })).rejects.toThrow(/already exists/);
        await expect(generateModule("order", { cwd: project, force: true })).resolves.toBeUndefined();

        // forcing doesn't register the route twice
        const routes = fs.readFileSync(path.join(project, "src/routes.ts"), "utf-8");
        expect(routes.match(/route: orderRoute/g)).toHaveLength(1);
    });

    it("keeps a backup of files that --force overwrites", async () => {
        await createProject("my-api", { template: "mongoose", cwd: tmp });
        const project = path.join(tmp, "my-api");
        await generateModule("order", { cwd: project });
        const service = path.join(project, "src/app/modules/order/order.service.ts");
        fs.writeFileSync(service, "// my custom logic\n");

        await generateModule("order", { cwd: project, force: true });

        expect(fs.readFileSync(service, "utf-8")).toContain("order_service");
        const backups = path.join(project, ".exp-node-server/backups");
        const [run] = fs.readdirSync(backups);
        const saved = path.join(backups, run!, "src/app/modules/order/order.service.ts");
        expect(fs.readFileSync(saved, "utf-8")).toBe("// my custom logic\n");
        // unchanged files aren't backed up
        expect(fs.existsSync(path.join(backups, run!, "src/app/modules/order/order.route.ts"))).toBe(false);
    });

    it.skipIf(process.getuid?.() === 0)("leaves the project untouched when a write fails", async () => {
        await createProject("my-api", { template: "prisma", cwd: tmp });
        const project = path.join(tmp, "my-api");
        const routes = path.join(project, "src/routes.ts");
        const before = fs.readFileSync(routes, "utf-8");
        fs.chmodSync(routes, 0o444); // written after the module files

        await expect(generateModule("order", { cwd: project })).rejects.toThrow();

        fs.chmodSync(routes, 0o644);
        expect(fs.readFileSync(routes, "utf-8")).toBe(before);
        expect(fs.existsSync(path.join(project, "src/app/modules/order"))).toBe(false);
        expect(fs.existsSync(path.join(project, "prisma/schema/order.prisma"))).toBe(false);
        expect(fs.existsSync(path.join(project, "tests/routes/order.test.ts"))).toBe(false);
        expect(fs.readFileSync(path.join(project, "src/swaggerOptions.ts"), "utf-8")).not.toContain("order");
    });

    it("generates public routes by default, and protected ones with --auth", async () => {
        await createProject("my-api", { template: "prisma", cwd: tmp });
        const project = path.join(tmp, "my-api");
        const read = (file: string) => fs.readFileSync(path.join(project, file), "utf-8");

        await generateModule("order", { cwd: project });
        await generateModule("invoice", { cwd: project, auth: true });

        expect(read("src/app/modules/order/order.route.ts")).not.toContain("import auth");
        expect(read("tests/routes/order.test.ts")).not.toContain("needs a signed-in user");
        expect(read("src/app/modules/invoice/invoice.route.ts").match(/auth\(\)/g)).toHaveLength(5);
        expect(read("tests/routes/invoice.test.ts")).toContain("needs a signed-in user");
        // an example field everywhere, so data flows end to end
        expect(read("src/app/modules/order/order.validation.ts")).toContain("name: z.string(");
        expect(read("prisma/schema/order.prisma")).toContain("name      String");
    });

    it("finds a taken path whatever the formatting of routes.ts", async () => {
        await createProject("my-api", { template: "mongoose", cwd: tmp });
        const project = path.join(tmp, "my-api");
        const routes = path.join(project, "src/routes.ts");
        fs.writeFileSync(
            routes,
            fs.readFileSync(routes, "utf-8").replace("];", "  {\n    route: legacyRouter,\n    path: '/order',\n  },\n];"),
        );

        await expect(generateModule("order", { cwd: project })).rejects.toThrow(/already used by legacyRouter/);
    });

    it("refuses a path that another module documents", async () => {
        await createProject("my-api", { template: "mongoose", cwd: tmp });
        const project = path.join(tmp, "my-api");
        const legacy = path.join(project, "src/app/modules/legacy");
        fs.mkdirSync(legacy);
        fs.writeFileSync(path.join(legacy, "legacy.swagger.ts"), "export const d = { '/api/order/{id}': {} };\n");

        await expect(generateModule("order", { cwd: project })).rejects.toThrow(/documented by the 'legacy' module/);
    });

    it("rejects generate-only flags on create", async () => {
        await expect(run(["create", "my-api", "--auth"])).rejects.toThrow(/only apply to generate/);
    });

    it("refuses a module whose path is taken by another router", async () => {
        await createProject("my-api", { template: "prisma", cwd: tmp });
        const project = path.join(tmp, "my-api");

        // the template's account routes are mounted at /auth
        await expect(generateModule("auth", { cwd: project })).rejects.toThrow(/already used by accountRouter/);
        expect(fs.existsSync(path.join(project, "src/app/modules/auth"))).toBe(false);
    });

    it("skips the route test in projects without a test setup", async () => {
        await createProject("my-api", { template: "mongoose", cwd: tmp });
        const project = path.join(tmp, "my-api");
        fs.rmSync(path.join(project, "vitest.config.ts"));

        await generateModule("order", { cwd: project });

        expect(fs.existsSync(path.join(project, "src/app/modules/order/order.route.ts"))).toBe(true);
        expect(fs.existsSync(path.join(project, "tests/routes/order.test.ts"))).toBe(false);
    });
});
