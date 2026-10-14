import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listRegisteredRoutes } from "../src/injectors/route.js";
import { TEMPLATES_DIR } from "../src/lib/paths.js";

/**
 * Keeps the mongoose and prisma templates at feature parity: they must only
 * differ where the database forces them to.
 */

const prisma = path.join(TEMPLATES_DIR, "prisma");
const mongoose = path.join(TEMPLATES_DIR, "mongoose");

/** Shared files that are allowed to differ, and why. */
const DATABASE_SPECIFIC: Record<string, string> = {
    "src/app/configs/index.ts": "DATABASE_URL format",
    "src/app/middlewares/auth.ts": "account lookup",
    "src/app/middlewares/global_error_handler.ts": "database error types",
    "src/app/middlewares/rate_limiter.ts": "rate limit store",
    "src/app/modules/account/account.service.ts": "queries",
    "src/app/modules/profile/profile.service.ts": "queries",
    "src/app/passport-js/providers.ts": "PROVIDER type import",
    "src/app/passport-js/social-account.ts": "queries",
    "src/app/queues/email.queue.ts": "pg-boss vs Agenda",
    "src/app/queues/index.ts": "pg-boss vs Agenda",
    "src/app/utils/JWT.ts": "ROLE type import",
    "src/app/utils/session.ts": "refresh token storage",
    "src/server.ts": "database connection",
    "src/swaggerOptions.ts": "API description",
    "tests/app.test.ts": "fixtures",
    "tests/helpers/fixtures.ts": "mock vs in-memory database",
    "tests/routes/account.test.ts": "mock vs in-memory database",
    "tests/routes/profile.test.ts": "mock vs in-memory database",
    "tests/routes/social.test.ts": "mock vs in-memory database",
    "tests/setup.ts": "mock vs in-memory database",
    "tests/queues/email.queue.test.ts": "pg-boss vs Agenda",
};

const listFiles = (root: string, dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(root, rel) : [rel];
    });

const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), "utf-8");

const sharedFiles = ["src", "tests"]
    .flatMap((dir) => listFiles(prisma, dir))
    .filter((file) => fs.existsSync(path.join(mongoose, file)));

/** `/api/...` paths used in a template's tests. */
const testedEndpoints = (root: string) =>
    new Set(listFiles(root, "tests").flatMap((f) => [...read(root, f).matchAll(/['"`](\/api\/[\w/:-]*)/g)].map((m) => m[1]!)));

describe("template parity", () => {
    it.each(sharedFiles.filter((f) => !(f in DATABASE_SPECIFIC)))("%s is identical", (file) => {
        expect(read(mongoose, file)).toBe(read(prisma, file));
    });

    it("only allows differences in files that exist in both templates", () => {
        const stale = Object.keys(DATABASE_SPECIFIC).filter((f) => !sharedFiles.includes(f));
        expect(stale).toEqual([]);
    });

    it("uses the same environment variables (apart from the docker-compose database)", () => {
        const keys = (root: string) =>
            [...read(root, ".env.example").matchAll(/^([A-Z_]+)=/gm)]
                .map((m) => m[1]!)
                .filter((k) => !k.startsWith("POSTGRES_"));

        expect(keys(mongoose)).toEqual(keys(prisma));
    });

    it("has the same npm scripts (apart from prisma migrations)", () => {
        const scripts = (root: string) =>
            Object.keys(JSON.parse(read(root, "package.json")).scripts as object).filter((s) => !s.startsWith("db:"));

        expect(scripts(mongoose)).toEqual(scripts(prisma));
    });

    it("tests the same endpoints", () => {
        expect([...testedEndpoints(mongoose)].sort()).toEqual([...testedEndpoints(prisma)].sort());
    });

    it.each([["prisma", prisma], ["mongoose", mongoose]])("%s tests every route it declares", (_name, root) => {
        const tested = [...testedEndpoints(root)];
        // where each module's router is mounted, as registered in routes.ts
        const routesTs = read(root, "src/routes.ts");
        const modules = new Map(
            [...routesTs.matchAll(/import (\w+) from '\.\/app\/modules\/\w+\/(\w+)\.route\.js'/g)].map((m) => [m[1]!, m[2]!]),
        );
        const declared = listRegisteredRoutes(routesTs).flatMap(({ path: mount, route }) => {
            const file = `src/app/modules/${modules.get(route!)}/${modules.get(route!)}.route.ts`;
            return [...read(root, file).matchAll(/\.(?:get|post|put|patch|delete)\(\s*'([^']*)'/g)].map(
                (m) => `/api${mount}${m[1] === "/" ? "" : m[1]}`,
            );
        });

        const untested = declared.filter((route) => !tested.some((t) => t.startsWith(route)));
        expect(untested).toEqual([]);
    });
});
