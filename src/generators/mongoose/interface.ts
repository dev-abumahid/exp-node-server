export const interfaceGenerator = (name: string): string => `// add the fields of a ${name} here
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type T_${name} = {};
`;
