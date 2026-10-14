export const validationGenerator = (name: string): string => `import { z } from 'zod';

const create_${name} = z.object({});
const update_${name} = z.object({});

export const ${name}_validations = {
  create_${name},
  update_${name},
};
`;
