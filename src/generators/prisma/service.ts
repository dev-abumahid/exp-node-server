import { inferType } from "../common/format.js";

export const prismaServiceGenerator = (name: string): string => `import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app_error.js';
import type { ${name}_validations } from './${name}.validation.js';

// req.body was already parsed by RequestValidator (see ${name}.route.ts), so it only
// holds the fields of these schemas: add a field there before the service can use it
${inferType("CreatePayload", name, `create_${name}`)}
${inferType("UpdatePayload", name, `update_${name}`)}

const get_all_${name}_from_db = async (_req: Request) => {
  // define your own logic here
  const result = await prisma.${name}.findMany();
  return result;
};

const get_single_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params as { id: string };
  const result = await prisma.${name}.findUnique({
    where: { id },
  });
  if (!result) throw new AppError('${name} not found', 404);
  return result;
};

const create_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const payload: CreatePayload = req.body;
  const result = await prisma.${name}.create({
    data: payload,
  });
  return result;
};

// update / delete of a missing record throw Prisma's P2025, which the global
// error handler turns into a 404
const update_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params as { id: string };
  const payload: UpdatePayload = req.body;
  const result = await prisma.${name}.update({
    where: { id },
    data: payload,
  });
  return result;
};

const delete_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params as { id: string };
  const result = await prisma.${name}.delete({
    where: { id },
  });
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
