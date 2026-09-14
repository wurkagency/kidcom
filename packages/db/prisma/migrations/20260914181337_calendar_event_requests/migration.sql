-- CreateTable
CREATE TABLE "calendar_event_requests" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "category" "CalendarEventCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" "SwapRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "calendar_event_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "calendar_event_requests" ADD CONSTRAINT "calendar_event_requests_childId_fkey" FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_requests" ADD CONSTRAINT "calendar_event_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
