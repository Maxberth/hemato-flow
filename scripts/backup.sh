#!/usr/bin/env bash
# Backup de PostgreSQL (RNF-12) — copia lógica de la BD de Pausa AI.
# Uso:
#   ./scripts/backup.sh [archivo.sql]     → backup a archivo (default: backups/pausa-ai-YYYYMMDD-HHMM.sql)
#   ./scripts/backup.sh --restore archivo.sql  → restaurar desde archivo
#
# Requiere: docker (contenedor pausa-postgres) o psql disponible.
# RTO objetivo < 4h (plan de recuperación: migraciones + seed + restore del último backup).

set -euo pipefail

CONTAINER=${PAUSA_PG_CONTAINER:-pausa-postgres}
DB_USER=${PAUSA_PG_USER:-pausa}
DB_NAME=${PAUSA_PG_NAME:-pausa_ai}
BACKUP_DIR="backups"

mkdir -p "$BACKUP_DIR"

if [ "${1:-}" = "--restore" ]; then
  FILE="${2:?Uso: backup.sh --restore archivo.sql}"
  if [ ! -f "$FILE" ]; then
    echo "❌ No existe el archivo: $FILE"
    exit 1
  fi
  echo "↩ Restaurando $FILE ..."
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    # Reset completo del schema público (restore determinista sin conflictos)
    docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$FILE"
  else
    psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
    psql "$DATABASE_URL" < "$FILE"
  fi
  echo "✔ Restauración completada"
  exit 0
fi

FILE="${1:-$BACKUP_DIR/pausa-ai-$(date +%Y%m%d-%H%M).sql}"

echo "💾 Respaldando $DB_NAME → $FILE"
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$FILE"
else
  pg_dump "$DATABASE_URL" > "$FILE"
fi
echo "✔ Backup completado: $FILE ($(wc -c < "$FILE") bytes)"
