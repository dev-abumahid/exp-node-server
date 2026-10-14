export const interfaceGenerator = (name: string): string => `// the fields of a ${name}; \`name\` is an example, keep it in sync with ${name}.validation.ts
export type T_${name} = {
  name: string;
};
`;
