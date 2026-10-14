/** Helpers for making small, style-preserving edits to TS source files. */

const IMPORT_RE = /^import\s[\s\S]*?from\s*(['"])[^'"]+\1;?[ \t]*$|^import\s*(['"])[^'"]+\2;?[ \t]*$/gm;

export interface ImportStyle {
    quote: "'" | '"';
    /** Whether relative imports are written with a `.js` extension. */
    jsExtension: boolean;
}

export function detectImportStyle(content: string): ImportStyle {
    const firstImport = content.match(/^import[\s\S]*?(['"])/m);
    return {
        quote: firstImport?.[1] === "'" ? "'" : '"',
        jsExtension: /from\s*['"]\.{1,2}\/[^'"]+\.js['"]/.test(content),
    };
}

/** Inserts `line` after the last import statement (or at the top if none). */
export function insertImport(content: string, line: string): string {
    let end = -1;
    for (const match of content.matchAll(IMPORT_RE)) {
        end = match.index + match[0].length;
    }

    if (end === -1) return `${line}\n${content}`;
    return `${content.slice(0, end)}\n${line}${content.slice(end)}`;
}

const PAIRS: Record<string, string> = { "[": "]", "{": "}", "(": ")" };

/**
 * Index of the bracket that closes a block whose body starts at `from`, or -1.
 * Tracks nesting and skips strings, template literals and comments, so entries
 * like `{ path: '/a', route: a, middlewares: [x] }` don't end the block early.
 */
export function findClosingBracket(content: string, from: number, close: "]" | "}"): number {
    const stack: string[] = [close];

    for (let i = from; i < content.length; i++) {
        const ch = content[i]!;
        const next = content[i + 1];

        if (ch === "/" && next === "/") {
            const end = content.indexOf("\n", i);
            if (end === -1) return -1;
            i = end;
        } else if (ch === "/" && next === "*") {
            const end = content.indexOf("*/", i + 2);
            if (end === -1) return -1;
            i = end + 1;
        } else if (ch === "'" || ch === '"' || ch === "`") {
            // skip to the matching unescaped quote (template `${}` can't hold our brackets
            // in route / swagger registrations, so they're treated as plain text)
            let j = i + 1;
            while (j < content.length && content[j] !== ch) j += content[j] === "\\" ? 2 : 1;
            if (j >= content.length) return -1;
            i = j;
        } else if (ch in PAIRS) {
            stack.push(PAIRS[ch]!);
        } else if (ch === "]" || ch === "}" || ch === ")") {
            if (stack.pop() !== ch) return -1; // unbalanced: don't guess
            if (stack.length === 0) return i;
        }
    }
    return -1;
}

/**
 * Appends `entry` as the last item of the bracketed/braced block that starts
 * at `opener`, matching the indentation of the existing items.
 * Returns `null` if the block can't be found.
 */
export function appendToBlock(
    content: string,
    opener: RegExp,
    close: "]" | "}",
    entry: string,
): string | null {
    const start = content.match(opener);
    if (start?.index === undefined) return null;

    const bodyStart = start.index + start[0].length;
    const bodyEnd = findClosingBracket(content, bodyStart, close);
    if (bodyEnd === -1) return null;

    const body = content.slice(bodyStart, bodyEnd);
    const closingIndent = body.match(/\n([ \t]*)$/)?.[1] ?? "";
    const itemIndent = body.match(/\n([ \t]+)\S/)?.[1] ?? `${closingIndent}  `;

    const trimmed = body.trimEnd();
    const needsComma = trimmed.length > 0 && !/[,[{]$/.test(trimmed);

    const newBody = `${trimmed}${needsComma ? "," : ""}\n${itemIndent}${entry}\n${closingIndent}`;
    return content.slice(0, bodyStart) + newBody + content.slice(bodyEnd);
}

export type InjectResult =
    | { status: "updated"; content: string }
    | { status: "unchanged" }
    | { status: "failed"; reason: string };

/**
 * Runs `edit` on LF-normalized content and restores CRLF line endings
 * afterwards if the original file used them.
 */
export function withLineEndings(content: string, edit: (lf: string) => InjectResult): InjectResult {
    const crlf = content.includes("\r\n");
    const result = edit(crlf ? content.replace(/\r\n/g, "\n") : content);
    if (!crlf || result.status !== "updated") return result;
    return { status: "updated", content: result.content.replace(/\n/g, "\r\n") };
}
