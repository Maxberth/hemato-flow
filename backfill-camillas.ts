import { prisma } from "./src/infrastructure/prisma/prisma.service";
// Backfill: recomputar duración de eventos cerrados (bug: se guardaba 0).
const r = await prisma.$executeRawUnsafe(`
  UPDATE "CamillaEvento"
  SET "duracionMin" = GREATEST(0, ROUND(EXTRACT(EPOCH FROM ("fin" - "inicio")) / 60)::int)
  WHERE "fin" IS NOT NULL
`);
console.log("eventos actualizados:", r);
const muestra = await prisma.$queryRawUnsafe(
  `SELECT numero, estado, inicio, fin, duracionMin FROM "CamillaEvento" e JOIN "CamillaDia" c ON c.id = e."camillaDiaId" WHERE e."fin" IS NOT NULL ORDER BY e."inicio" DESC LIMIT 6`,
);
console.log(JSON.stringify(muestra, null, 1));
await prisma.$disconnect();
