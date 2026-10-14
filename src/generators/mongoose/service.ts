import { awaitChain, inferType } from "../common/format.js";

export const serviceGenerator = (name: string): string => `import type { Request } from 'express';
import type { z } from 'zod';
import { AppError } from '../../utils/app_error.js';
import { ${name}_model } from './${name}.schema.js';
import type { ${name}_validations } from './${name}.validation.js';

// req.body was already parsed by RequestValidator (see ${name}.route.ts), so it only
// holds the fields of these schemas: add a field there before the service can use it
${inferType("CreatePayload", name, `create_${name}`)}
${inferType("UpdatePayload", name, `update_${name}`)}

const notFound = () => new AppError('${name} not found', 404);

const get_all_${name}_from_db = async (_req: Request) => {
  // define your own logic here
${awaitChain(`${name}_model`, [".find()", ".lean()"])}
  return result;
};

const get_single_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params;
${awaitChain(`${name}_model`, [".findById(id)", ".lean()"])}
  if (!result) throw notFound();
  return result;
};

const create_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const payload: CreatePayload = req.body;
  const result = await ${name}_model.create(payload);
  return result;
};

const update_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params;
  const payload: UpdatePayload = req.body;
${awaitChain(`${name}_model`, [".findByIdAndUpdate(id, payload, { returnDocument: 'after' })", ".lean()"])}
  if (!result) throw notFound();
  return result;
};

const delete_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params;
${awaitChain(`${name}_model`, [".findByIdAndDelete(id)", ".lean()"])}
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
