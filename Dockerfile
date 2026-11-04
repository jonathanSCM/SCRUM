# ---- deps: instala dependencias (se cachea mientras no cambie package*.json) ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: genera el cliente de Prisma y compila Next.js ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# En producción usamos PostgreSQL (en desarrollo local se usa SQLite por simplicidad).
# Este reemplazo solo afecta la imagen de Docker, nunca el repositorio.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

# DATABASE_URL real la da Coolify en runtime; acá solo hace falta que la variable
# exista para que "prisma generate" pueda validar el schema (no se conecta a nada).
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN npx prisma generate
RUN npm run build

# ---- runner: imagen final que corre el servidor ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# prisma/seed.ts (migración de datos viejos) reutiliza estas funciones puras.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/scrum ./src/lib/scrum
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --chown=nextjs:nodejs --chmod=755 docker-entrypoint.sh ./docker-entrypoint.sh

# Sin "chown -R /app": duplicaba toda la carpeta node_modules en otra capa (~2 min y mucho disco).
# Cada COPY ya asigna el dueño con --chown.
RUN chown nextjs:nodejs /app

USER nextjs
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
