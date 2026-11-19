# Base común para compilar y ejecutar con las mismas bibliotecas nativas.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production TZ=UTC

FROM base AS compilacion
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma generate (postinstall) exige DATABASE_URL aunque no se conecte.
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npm ci --include=dev
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM base AS produccion
# Se conservan las dependencias de desarrollo: prisma, tsx y dotenv permiten
# ejecutar migraciones y el seed desde esta imagen sin instalar herramientas al desplegar.
# La etapa final excluye la caché de npm, las capas de compilación y el resto del código fuente.
COPY --from=compilacion /app/node_modules ./node_modules
COPY --from=compilacion /app/package.json /app/package-lock.json ./
COPY --from=compilacion /app/dist ./dist
COPY --from=compilacion /app/prisma ./prisma
COPY --from=compilacion /app/prisma.config.ts ./
# El seed importa el cliente TypeScript generado mediante tsx.
COPY --from=compilacion /app/src/generated/prisma ./src/generated/prisma
# Informativo: Cloud Run inyecta PORT en ejecución.
EXPOSE 3001
CMD ["node", "dist/main"]
