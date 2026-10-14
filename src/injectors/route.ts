import {
    appendToBlock,
    detectImportStyle,
    type InjectResult,
    insertImport,
    withLineEndings,
} from "./source.js";

/** Registers `<name>Route` in the project's `src/routes.ts`. */
export function injectRoute(content: string, name: string): InjectResult {
    return withLineEndings(content, (lf) => edit(lf, name));
}

function edit(content: string, name: string): InjectResult {
    const { quote: q, jsExtension } = detectImportStyle(content);
    const modulePath = `./app/modules/${name}/${name}.route`;
    const routeVar = `${name}Route`;

    let next = content;

    if (!next.includes(modulePath)) {
        const ext = jsExtension ? ".js" : "";
        next = insertImport(next, `import ${routeVar} from ${q}${modulePath}${ext}${q};`);
    }

    if (!new RegExp(`route:\\s*${routeVar}\\b`).test(next)) {
        const updated = appendToBlock(
            next,
            /const moduleRoutes\s*=\s*\[/,
            "]",
            `{ path: ${q}/${name}${q}, route: ${routeVar} },`,
        );
        if (updated === null) {
            return { status: "failed", reason: "could not find `const moduleRoutes = [...]`" };
        }
        next = updated;
    }

    return next === content ? { status: "unchanged" } : { status: "updated", content: next };
}
