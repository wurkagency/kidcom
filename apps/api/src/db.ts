import { PrismaClient } from "@kidcom/db";

// Single shared Prisma client instance for the whole API process.
export const prisma = new PrismaClient();
