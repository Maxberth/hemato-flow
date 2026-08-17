-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'MEDICO', 'ASISTENTE_SOCIAL');

-- CreateEnum
CREATE TYPE "Etiqueta" AS ENUM ('ROJA', 'AMARILLA', 'VERDE');

-- CreateEnum
CREATE TYPE "Banda" AS ENUM ('CERCANA', 'REGIONAL', 'DISTANTE');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "CitaEstado" AS ENUM ('PROPUESTA', 'PROGRAMADA', 'CONFIRMADA', 'ASISTIDA', 'NO_SHOW', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigenCita" AS ENUM ('INICIAL', 'REPROGRAMACION');

-- CreateEnum
CREATE TYPE "LoteEstado" AS ENUM ('ABIERTO', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "AvisoTipo" AS ENUM ('AVISO_CITA', 'RECORDATORIO', 'REPROGRAMACION', 'PREGUNTA_MOTIVO');

-- CreateEnum
CREATE TYPE "AvisoEstado" AS ENUM ('PROGRAMADO', 'ENVIADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "TareaTipo" AS ENUM ('SILENCIO', 'INASISTENCIA');

-- CreateEnum
CREATE TYPE "TareaEstado" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'RESUELTA');

-- CreateEnum
CREATE TYPE "CausaCatalogo" AS ENUM ('TRANSPORTE', 'ECONOMICO', 'FAMILIAR', 'EDUCATIVO', 'GEOGRAFICO', 'INFORMACION', 'SALUD', 'OTRO');

-- CreateTable
CREATE TABLE "Configuracion" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "descripcion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "nombre" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profesional" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "especialidad" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profesional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PacienteProfesional" (
    "pacienteId" TEXT NOT NULL,
    "profesionalId" TEXT NOT NULL,
    "asignadoPor" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TipoProcedimiento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL,

    CONSTRAINT "TipoProcedimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paciente" (
    "id" TEXT NOT NULL,
    "numeroHash" TEXT NOT NULL,
    "numeroCifrado" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "etiqueta" "Etiqueta" NOT NULL DEFAULT 'VERDE',
    "banda" "Banda" NOT NULL DEFAULT 'CERCANA',
    "fechaObjetivo" TIMESTAMP(3) NOT NULL,
    "canal" "Canal" NOT NULL DEFAULT 'WHATSAPP',
    "tipoProcedimientoId" TEXT NOT NULL,
    "frecuenciaDias" INTEGER,
    "hospitalizado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capacidad" (
    "fecha" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL DEFAULT '08:00',
    "horaFin" TEXT NOT NULL DEFAULT '14:00',
    "espacios" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capacidad_pkey" PRIMARY KEY ("fecha")
);

-- CreateTable
CREATE TABLE "LotePlanificacion" (
    "id" TEXT NOT NULL,
    "estado" "LoteEstado" NOT NULL DEFAULT 'ABIERTO',
    "generadoPor" TEXT NOT NULL,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididoPor" TEXT,
    "decididoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "sinCupo" JSONB,

    CONSTRAINT "LotePlanificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cita" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "loteId" TEXT,
    "fecha" DATE NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL,
    "espacio" INTEGER NOT NULL,
    "tipoProcedimientoId" TEXT NOT NULL,
    "estado" "CitaEstado" NOT NULL DEFAULT 'PROPUESTA',
    "origen" "OrigenCita" NOT NULL DEFAULT 'INICIAL',
    "citaPreviaId" TEXT,
    "confirmadaEn" TIMESTAMP(3),
    "asistidaEn" TIMESTAMP(3),
    "motivoCancelacion" TEXT,
    "justificacion" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" TEXT NOT NULL,
    "citaId" TEXT NOT NULL,
    "tipo" "AvisoTipo" NOT NULL,
    "canal" "Canal" NOT NULL,
    "mensaje" TEXT NOT NULL,
    "programadoPara" TIMESTAMP(3) NOT NULL,
    "enviadoEn" TIMESTAMP(3),
    "estado" "AvisoEstado" NOT NULL DEFAULT 'PROGRAMADO',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TareaSocial" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "citaId" TEXT,
    "tipo" "TareaTipo" NOT NULL,
    "estado" "TareaEstado" NOT NULL DEFAULT 'PENDIENTE',
    "venceEn" TIMESTAMP(3) NOT NULL,
    "asignadaA" TEXT,
    "resultado" TEXT,
    "resueltaEn" TIMESTAMP(3),

    CONSTRAINT "TareaSocial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CausaInasistencia" (
    "id" TEXT NOT NULL,
    "citaId" TEXT NOT NULL,
    "causa" "CausaCatalogo" NOT NULL,
    "textoLibre" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CausaInasistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRol" "Rol",
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "detalle" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL,
    "pacienteId" TEXT,
    "sid" TEXT,
    "remitente" TEXT NOT NULL,
    "contenido" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "sid" TEXT NOT NULL,
    "fromHash" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RECIBIDO',
    "error" TEXT,
    "payload" JSONB,
    "intentosReintento" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoEn" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");

-- CreateIndex
CREATE INDEX "PacienteProfesional_profesionalId_idx" ON "PacienteProfesional"("profesionalId");

-- CreateIndex
CREATE UNIQUE INDEX "PacienteProfesional_pacienteId_profesionalId_key" ON "PacienteProfesional"("pacienteId", "profesionalId");

-- CreateIndex
CREATE UNIQUE INDEX "TipoProcedimiento_nombre_key" ON "TipoProcedimiento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_numeroHash_key" ON "Paciente"("numeroHash");

-- CreateIndex
CREATE INDEX "Paciente_etiqueta_activo_idx" ON "Paciente"("etiqueta", "activo");

-- CreateIndex
CREATE INDEX "Paciente_banda_idx" ON "Paciente"("banda");

-- CreateIndex
CREATE INDEX "LotePlanificacion_estado_generadoEn_idx" ON "LotePlanificacion"("estado", "generadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Cita_citaPreviaId_key" ON "Cita"("citaPreviaId");

-- CreateIndex
CREATE INDEX "Cita_estado_fecha_idx" ON "Cita"("estado", "fecha");

-- CreateIndex
CREATE INDEX "Cita_pacienteId_estado_idx" ON "Cita"("pacienteId", "estado");

-- CreateIndex
CREATE INDEX "Cita_loteId_idx" ON "Cita"("loteId");

-- CreateIndex
CREATE INDEX "Aviso_estado_programadoPara_idx" ON "Aviso"("estado", "programadoPara");

-- CreateIndex
CREATE INDEX "Aviso_citaId_idx" ON "Aviso"("citaId");

-- CreateIndex
CREATE INDEX "TareaSocial_estado_venceEn_idx" ON "TareaSocial"("estado", "venceEn");

-- CreateIndex
CREATE INDEX "TareaSocial_pacienteId_idx" ON "TareaSocial"("pacienteId");

-- CreateIndex
CREATE UNIQUE INDEX "CausaInasistencia_citaId_key" ON "CausaInasistencia"("citaId");

-- CreateIndex
CREATE INDEX "CausaInasistencia_causa_creadoEn_idx" ON "CausaInasistencia"("causa", "creadoEn");

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "Auditoria_creadoEn_idx" ON "Auditoria"("creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "Mensaje_sid_key" ON "Mensaje"("sid");

-- CreateIndex
CREATE INDEX "Mensaje_pacienteId_creadoEn_idx" ON "Mensaje"("pacienteId", "creadoEn");

-- CreateIndex
CREATE INDEX "WebhookEvent_fromHash_creadoEn_idx" ON "WebhookEvent"("fromHash", "creadoEn");

-- AddForeignKey
ALTER TABLE "PacienteProfesional" ADD CONSTRAINT "PacienteProfesional_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PacienteProfesional" ADD CONSTRAINT "PacienteProfesional_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "Profesional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_tipoProcedimientoId_fkey" FOREIGN KEY ("tipoProcedimientoId") REFERENCES "TipoProcedimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "LotePlanificacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_tipoProcedimientoId_fkey" FOREIGN KEY ("tipoProcedimientoId") REFERENCES "TipoProcedimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_citaPreviaId_fkey" FOREIGN KEY ("citaPreviaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaSocial" ADD CONSTRAINT "TareaSocial_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaSocial" ADD CONSTRAINT "TareaSocial_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CausaInasistencia" ADD CONSTRAINT "CausaInasistencia_citaId_fkey" FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensaje" ADD CONSTRAINT "Mensaje_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
