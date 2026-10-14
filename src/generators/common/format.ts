/**
 * Helpers that lay out generated lines the way prettier would (with the templates'
 * `printWidth`), so freshly generated modules pass `npm run lint` whatever the
 * module name's length.
 */
export const PRINT_WIDTH = 100;

/** `type <alias> = z.infer<typeof <name>_validations.<schema>>;` */
export const inferType = (alias: string, name: string, schema: string): string => {
    const target = `typeof ${name}_validations.${schema}`;
    const oneLine = `type ${alias} = z.infer<${target}>;`;
    return oneLine.length <= PRINT_WIDTH ? oneLine : `type ${alias} = z.infer<\n  ${target}\n>;`;
};

/** `  const result = await <head><calls...>;`, as one line or a member chain. */
export const awaitChain = (head: string, calls: string[]): string => {
    const oneLine = `  const result = await ${head}${calls.join("")};`;
    if (oneLine.length <= PRINT_WIDTH) return oneLine;
    return `  const result = await ${head}\n${calls.map((c) => `    ${c}`).join("\n")};`;
};
