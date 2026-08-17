# Railway (Bun service): aplicar migraciones y arrancar la API
# El proceso no hiberna con tráfico entrante del webhook (RNF-03)
pre: bun run db:deploy && bun run db:seed
start: bun run start
