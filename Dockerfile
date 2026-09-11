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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
