import {
    appendToBlock,
    detectImportStyle,
    findClosingBracket,
    type InjectResult,
    insertImport,
    isBalanced,
    topLevelObjects,
    withLineEndings,
} from "./source.js";

const MODULE_ROUTES = /const moduleRoutes\s*=\s*\[/;

export interface RegisteredRoute {
    path: string;
    /** The router variable, or `null` when it isn't a plain identifier. */
    route: string | null;
}

/**
 * Every router mounted in `routes.ts`: the `moduleRoutes` entries (properties in
 * any order, over any number of lines) and direct `appRouter.use('/path', ...)` calls.
 */
export function listRegisteredRoutes(content: string): RegisteredRoute[] {
    const routes: RegisteredRoute[] = [];

    const start = content.match(MODULE_ROUTES);
    if (start?.index !== undefined) {
        const bodyStart = start.index + start[0].length;
        const bodyEnd = findClosingBracket(content, bodyStart, "]");
        if (bodyEnd !== -1) {
            for (const item of topLevelObjects(content, bodyStart, bodyEnd)) {
                const path = /\bpath\s*:\s*(['"`])([^'"`]*)\1/.exec(item)?.[2];
                if (path === undefined) continue;
                const route = /\broute\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(item)?.[1] ?? null;
                routes.push({ path, route });
            }
        }
    }

    for (const m of content.matchAll(/\.use\(\s*(['"`])(\/[^'"`]*)\1\s*,\s*([A-Za-z_$][\w$]*)?/g)) {
        routes.push({ path: m[2]!, route: m[3] ?? null });
    }
    return routes;
}

/** Registers `<name>Route` in the project's `src/routes.ts`. */
export function injectRoute(content: string, name: string): InjectResult {
    return withLineEndings(content, (lf) => edit(lf, name));
}

function edit(content: string, name: string): InjectResult {
    const { quote: q, jsExtension } = detectImportStyle(content);
    const modulePath = `./app/modules/${name}/${name}.route`;
    const routeVar = `${name}Route`;
    const isRegistered = (src: string) =>
        listRegisteredRoutes(src).filter((r) => r.route === routeVar).length;

    let next = content;

    if (!next.includes(modulePath)) {
        const ext = jsExtension ? ".js" : "";
        next = insertImport(next, `import ${routeVar} from ${q}${modulePath}${ext}${q};`);
    }

    if (isRegistered(next) === 0) {
        const updated = appendToBlock(next, MODULE_ROUTES, "]", `{ path: ${q}/${name}${q}, route: ${routeVar} },`);
        if (updated === null) {
            return { status: "failed", reason: "could not find `const moduleRoutes = [...]`" };
        }
        next = updated;
    }

    if (next === content) return { status: "unchanged" };

    // never write something that looks broken: the edit must keep the brackets
    // balanced and leave exactly one registration
    if ((isBalanced(content) && !isBalanced(next)) || isRegistered(next) !== 1) {
        return { status: "failed", reason: "the edited file didn't look right" };
    }
    return { status: "updated", content: next };
}
