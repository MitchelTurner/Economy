# Island Ledger API — multi-stage production image
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@island-ledger/api --include-workspace-root

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY apps/api ./apps/api
COPY data ./data
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=@island-ledger/api --include-workspace-root \
  && npm install prisma tsx --no-save --workspace=@island-ledger/api
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
COPY data ./data
RUN chmod +x ./apps/api/docker-entrypoint.sh \
  && npx prisma generate --schema apps/api/prisma/schema.prisma
WORKDIR /app/apps/api
EXPOSE 3000
ENV SEED_ON_BOOT=off
ENTRYPOINT ["./docker-entrypoint.sh"]
