import {
    appendToBlock,
    detectImportStyle,
    type InjectResult,
    insertImport,
    isBalanced,
    withLineEndings,
} from "./source.js";

/** Registers `<name>SwaggerDocs` in the project's `src/swaggerOptions.ts`. */
export function injectSwagger(content: string, name: string): InjectResult {
    return withLineEndings(content, (lf) => edit(lf, name));
}

function edit(content: string, name: string): InjectResult {
    const { quote: q, jsExtension } = detectImportStyle(content);
    const modulePath = `./app/modules/${name}/${name}.swagger`;
    const docsVar = `${name}SwaggerDocs`;

    let next = content;

    if (!next.includes(modulePath)) {
        const ext = jsExtension ? ".js" : "";
        next = insertImport(next, `import { ${docsVar} } from ${q}${modulePath}${ext}${q};`);
    }

    if (!next.includes(`...${docsVar}`)) {
        const updated = appendToBlock(next, /paths:\s*\{/, "}", `...${docsVar},`);
        if (updated === null) {
            return { status: "failed", reason: "could not find `paths: { ... }`" };
        }
        next = updated;
    }

    if (next === content) return { status: "unchanged" };

    // never write something that looks broken (see route.ts)
    const spreads = next.match(new RegExp(`\\.\\.\\.${docsVar}\\b`, "g"))?.length ?? 0;
    if ((isBalanced(content) && !isBalanced(next)) || spreads !== 1) {
        return { status: "failed", reason: "the edited file didn't look right" };
    }
    return { status: "updated", content: next };
}
