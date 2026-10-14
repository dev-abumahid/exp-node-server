export const prismaServiceGenerator = (name: string): string => `import type { Request } from 'express';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app_error.js';

const get_all_${name}_from_db = async (_req: Request) => {
  // define your own logic here
  const result = await prisma.${name}.findMany();
  return result;
};

const get_single_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params as { id: string };
  const result = await prisma.${name}.findUnique({ where: { id } });
  if (!result) throw new AppError('${name} not found', 404);
  return result;
};

const create_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const result = await prisma.${name}.create({ data: req.body });
  return result;
};

// update / delete of a missing record throw Prisma's P2025, which the global
// error handler turns into a 404
const update_${name}_into_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params as { id: string };
  const result = await prisma.${name}.update({ where: { id }, data: req.body });
  return result;
};

const delete_${name}_from_db = async (req: Request) => {
  // define your own logic here
  const { id } = req.params as { id: string };
  const result = await prisma.${name}.delete({ where: { id } });
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
