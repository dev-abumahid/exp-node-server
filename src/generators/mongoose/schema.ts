export const schemaGenerator = (name: string): string => `import { Schema, model } from 'mongoose';
import type { T_${name} } from './${name}.interface.js';

const schema = new Schema<T_${name}>(
  {
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true, versionKey: false },
);

export const ${name}_model = model('${name}', schema);
`;
