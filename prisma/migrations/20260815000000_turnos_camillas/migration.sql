-- CreateEnum
CREATE TYPE "Servicio" AS ENUM ('AMBULATORIO', 'CONSULTA');

-- CreateEnum
CREATE TYPE "CamillaEstado" AS ENUM ('LIBRE', 'OCUPADA', 'PREPARACION');

-- Mapear las filas NO_SHOW a NO_LLEGO (el valor ya existe: migración
-- 20260815000001_agregar_no_llego) antes de la conversión del enum.
UPDATE "Cita" SET "estado" = 'NO_LLEGO' WHERE "estado" = 'NO_SHOW';

-- AlterEnum
BEGIN;
CREATE TYPE "CitaEstado_new" AS ENUM ('PROPUESTA', 'PROGRAMADA', 'CONFIRMADA', 'EN_ATENCION', 'ASISTIDA', 'NO_LLEGO', 'CANCELADA');
ALTER TABLE "public"."Cita" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Cita" ALTER COLUMN "estado" TYPE "CitaEstado_new" USING ("estado"::text::"CitaEstado_new");
ALTER TYPE "CitaEstado" RENAME TO "CitaEstado_old";
ALTER TYPE "CitaEstado_new" RENAME TO "CitaEstado";
DROP TYPE "public"."CitaEstado_old";
ALTER TABLE "Cita" ALTER COLUMN "estado" SET DEFAULT 'PROPUESTA';
COMMIT;

-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'ENFERMERO';

-- DropIndex
DROP INDEX "Cita_estado_fecha_idx";

-- AlterTable
ALTER TABLE "Cita" DROP COLUMN "espacio",
DROP COLUMN "horaInicio",
ADD COLUMN     "doctorId" TEXT,
ADD COLUMN     "horaEstimada" TEXT,
ADD COLUMN     "llegadaEn" TIMESTAMP(3),
ADD COLUMN     "servicio" "Servicio" NOT NULL DEFAULT 'CONSULTA',
ADD COLUMN     "turno" INTEGER;

-- AlterTable
ALTER TABLE "Paciente" ADD COLUMN     "servicio" "Servicio" NOT NULL DEFAULT 'CONSULTA';

-- DropTable
DROP TABLE "Capacidad";

-- CreateTable
CREATE TABLE "CupoDiario" (
    "fecha" DATE NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 10,
    "camillas" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CupoDiario_pkey" PRIMARY KEY ("fecha")
);

-- CreateTable
CREATE TABLE "HorarioMedico" (
    "id" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "cupo" INTEGER NOT NULL DEFAULT 8,

    CONSTRAINT "HorarioMedico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamillaDia" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "CamillaEstado" NOT NULL DEFAULT 'LIBRE',
    "citaId" TEXT,
    "estadoDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamillaDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamillaEvento" (
    "id" TEXT NOT NULL,
    "camillaDiaId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "citaId" TEXT,
    "pacienteId" TEXT,
    "estado" "CamillaEstado" NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "duracionMin" INTEGER,

    CONSTRAINT "CamillaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorarioMedico_fecha_idx" ON "HorarioMedico"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioMedico_profesionalId_fecha_key" ON "HorarioMedico"("profesionalId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "CamillaDia_citaId_key" ON "CamillaDia"("citaId");

-- CreateIndex
CREATE INDEX "CamillaDia_fecha_estado_idx" ON "CamillaDia"("fecha", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "CamillaDia_fecha_numero_key" ON "CamillaDia"("fecha", "numero");

-- CreateIndex
CREATE INDEX "CamillaEvento_fecha_idx" ON "CamillaEvento"("fecha");

-- CreateIndex
CREATE INDEX "CamillaEvento_camillaDiaId_idx" ON "CamillaEvento"("camillaDiaId");

-- CreateIndex
CREATE INDEX "Cita_fecha_estado_idx" ON "Cita"("fecha", "estado");

-- CreateIndex
CREATE INDEX "Cita_doctorId_fecha_idx" ON "Cita"("doctorId", "fecha");

-- AddForeignKey
ALTER TABLE "HorarioMedico" ADD CONSTRAINT "HorarioMedico_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "Profesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Profesional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamillaDia" ADD CONSTRAINT "CamillaDia_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamillaEvento" ADD CONSTRAINT "CamillaEvento_camillaDiaId_fkey" FOREIGN KEY ("camillaDiaId") REFERENCES "CamillaDia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

