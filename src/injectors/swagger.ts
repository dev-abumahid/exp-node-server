import {
    appendToBlock,
    detectImportStyle,
    type InjectResult,
    insertImport,
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

    return next === content ? { status: "unchanged" } : { status: "updated", content: next };
}
