-- AlterTable
ALTER TABLE "Paciente" ADD COLUMN "telegramChatId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_telegramChatId_key" ON "Paciente"("telegramChatId");
