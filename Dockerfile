# Imagen de producción del backend de SIRA.
# Se conservan las dependencias de desarrollo porque la migración (prisma) y el seed (tsx) corren desde la misma imagen.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production TZ=UTC
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma generate (postinstall) exige DATABASE_URL aunque no se conecte
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npm ci --include=dev
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/main"]
