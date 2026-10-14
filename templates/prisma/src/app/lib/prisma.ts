import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { configs } from '../configs/index.js';

const adapter = new PrismaPg({ connectionString: configs.db_url as string });
const prisma = new PrismaClient({ adapter });

export { prisma };
