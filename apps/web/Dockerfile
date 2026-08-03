# Island Ledger web — Vite build + nginx
# Build context: monorepo root (required)
# Railway: Builder=Dockerfile, Dockerfile path=apps/web/Dockerfile, root directory empty
#   Set VITE_API_URL=https://<your-api>.up.railway.app (no trailing slash)
#   Leave public networking target port empty (listens on $PORT)

FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Explicit copy so cache invalidates when the template is added/changed
COPY apps/web/nginx.conf.template apps/web/nginx.conf.template
RUN npm ci --workspace=@island-ledger/web --include-workspace-root
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM nginx:1.27-alpine AS runner
# Railway injects PORT; compose sets PORT=80
ENV PORT=80
# Used only when SPA calls /api/* (VITE_API_URL=/api). Absolute VITE_API_URL skips this.
ENV API_UPSTREAM=http://api:3000/
# Copy from build stage (not raw context) — avoids Railway cache/context misses on new files
COPY --from=build /app/apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
# Official nginx image runs envsubst on /etc/nginx/templates/*.template
CMD ["nginx", "-g", "daemon off;"]
