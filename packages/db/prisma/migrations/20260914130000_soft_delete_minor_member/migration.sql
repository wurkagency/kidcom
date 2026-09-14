-- AlterTable
ALTER TABLE "child_access" ADD COLUMN     "isMinorMember" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "children" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "child_deletion_requests" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "confirmedByIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "child_deletion_requests_childId_key" ON "child_deletion_requests"("childId");

-- AddForeignKey
ALTER TABLE "child_deletion_requests" ADD CONSTRAINT "child_deletion_requests_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
