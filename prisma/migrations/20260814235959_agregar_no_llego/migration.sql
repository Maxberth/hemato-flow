-- Agregar NO_LLEGO al enum vigente (transacción propia: PostgreSQL prohíbe
-- usar un valor nuevo del enum en la misma transacción que lo agrega).
ALTER TYPE "CitaEstado" ADD VALUE 'NO_LLEGO';
