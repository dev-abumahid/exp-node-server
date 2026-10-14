export const validationGenerator = (name: string): string => `import { z } from 'zod';

// \`name\` is an example field: rename it or add yours here, in the database schema
// and in tests/routes/${name}.test.ts. Fields that aren't listed here are removed
// from req.body before it reaches the service.
const create_${name} = z.object({
  name: z.string('Name is required').trim().min(1).max(200),
});

const update_${name} = create_${name}.partial();

export const ${name}_validations = {
  create_${name},
  update_${name},
};
`;
