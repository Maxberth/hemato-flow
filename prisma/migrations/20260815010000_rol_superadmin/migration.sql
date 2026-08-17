-- Rol SUPERADMIN: atraviesa todos los guards de rol (ver requiere-rol.ts).
-- Transacción propia: PostgreSQL prohíbe usar un valor nuevo del enum en la
-- misma transacción que lo agrega.
ALTER TYPE "Rol" ADD VALUE 'SUPERADMIN';
