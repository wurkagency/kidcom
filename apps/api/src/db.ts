import { PrismaClient } from "@kinnd/db";

// Single shared Prisma client instance for the whole API process.
export const prisma = new PrismaClient();
