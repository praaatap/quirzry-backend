-- CreateTable
CREATE TABLE "Challenge" (
    "id" SERIAL NOT NULL,
    "challengerId" INTEGER NOT NULL,
    "opponentId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "quizId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
