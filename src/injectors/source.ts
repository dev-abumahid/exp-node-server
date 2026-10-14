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
 * If a comment, string or template literal starts at `i`, the index of its last
 * character (-1 if it never ends). Otherwise `null`: `i` is ordinary code.
 */
function skipNonCode(content: string, i: number): number | null {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === "/" && next === "/") {
        const end = content.indexOf("\n", i);
        return end === -1 ? content.length - 1 : end;
    }
    if (ch === "/" && next === "*") {
        const end = content.indexOf("*/", i + 2);
        return end === -1 ? -1 : end + 1;
    }
    if (ch === "'" || ch === '"') {
        let j = i + 1;
        while (j < content.length && content[j] !== ch && content[j] !== "\n") {
            j += content[j] === "\\" ? 2 : 1;
        }
        return content[j] === ch ? j : -1;
    }
    if (ch === "`") {
        // template literal: `${ ... }` holds real code, which may itself contain
        // brackets, strings and nested templates
        let j = i + 1;
        while (j < content.length) {
            if (content[j] === "\\") j += 2;
            else if (content[j] === "`") return j;
            else if (content[j] === "$" && content[j + 1] === "{") {
                const end = walk(content, j + 2, ["}"], true);
                if (end === -1) return -1;
                j = end + 1;
            } else j++;
        }
        return -1;
    }
    return null;
}

/**
 * Walks code from `from` with `stack` holding the closers still expected.
 * With `stopWhenClosed`, returns the index where the stack empties; otherwise
 * returns `content.length` if the code ends balanced. -1 when brackets don't
 * match or a string / comment never ends.
 */
function walk(content: string, from: number, stack: string[], stopWhenClosed: boolean): number {
    for (let i = from; i < content.length; i++) {
        const skipped = skipNonCode(content, i);
        if (skipped !== null) {
            if (skipped === -1) return -1;
            i = skipped;
            continue;
        }

        const ch = content[i]!;
        if (ch in PAIRS) {
            stack.push(PAIRS[ch]!);
        } else if (ch === "]" || ch === "}" || ch === ")") {
            if (stack.pop() !== ch) return -1; // unbalanced: don't guess
            if (stopWhenClosed && stack.length === 0) return i;
        }
    }
    return !stopWhenClosed && stack.length === 0 ? content.length : -1;
}

/**
 * Index of the bracket that closes a block whose body starts at `from`, or -1.
 * Tracks nesting and skips strings, template literals and comments, so entries
 * like `{ path: '/a', route: a, middlewares: [x] }` don't end the block early.
 */
export function findClosingBracket(content: string, from: number, close: "]" | "}"): number {
    return walk(content, from, [close], true);
}

/** Whether every bracket in `content` is closed, ignoring strings and comments. */
export function isBalanced(content: string): boolean {
    return walk(content, 0, [], false) === content.length;
}

/**
 * The `{ ... }` items of the array / object body `[start, end)`, as source text.
 * Nested brackets, strings and comments are skipped over.
 */
export function topLevelObjects(content: string, start: number, end: number): string[] {
    const items: string[] = [];
    for (let i = start; i < end; i++) {
        const skipped = skipNonCode(content, i);
        if (skipped !== null) {
            if (skipped === -1) return items;
            i = skipped;
            continue;
        }
        const ch = content[i]!;
        if (ch in PAIRS) {
            const close = walk(content, i + 1, [PAIRS[ch]!], true);
            if (close === -1) return items;
            if (ch === "{") items.push(content.slice(i, close + 1));
            i = close;
        }
    }
    return items;
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
