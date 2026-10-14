export const serviceGenerator = (name: string): string => `import type { Request } from 'express';
import { AppError } from '../../utils/app_error.js';
import { ${name}_model } from './${name}.schema.js';

const notFound = () => new AppError('${name} not found', 404);

const get_all_${name}_from_db = async (_req: Request) => {
  // define your own logic here
  const result = await ${name}_model.find().lean();
  return result;
};

const get_single_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params;
  const result = await ${name}_model.findById(id).lean();
  if (!result) throw notFound();
  return result;
};

const create_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const result = await ${name}_model.create(req.body);
  return result;
};

const update_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params;
  const result = await ${name}_model
    .findByIdAndUpdate(id, req.body, { returnDocument: 'after' })
    .lean();
  if (!result) throw notFound();
  return result;
};

const delete_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params;
  const result = await ${name}_model.findByIdAndDelete(id).lean();
  if (!result) throw notFound();
  return result;
};

export const ${name}_service = {
  get_all_${name}_from_db,
  get_single_${name}_from_db,
  create_${name}_into_db,
  update_${name}_into_db,
  delete_${name}_from_db,
};
`;
