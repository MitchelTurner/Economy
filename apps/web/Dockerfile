# Island Ledger web — Vite build + nginx (SPA only)
# Build context: apps/web (NOT the monorepo root)
# Railway:
#   Root Directory = apps/web
#   Builder = Dockerfile
#   Dockerfile path = Dockerfile
#   Set VITE_API_URL=https://<your-api>.up.railway.app (no trailing slash)
#     → injected at container start via /runtime-config.js (redeploy, no rebuild required)
#   Networking target port: leave EMPTY (nginx listens on $PORT)
#
# Local / CI:
#   docker build -f apps/web/Dockerfile -t island-web apps/web

FROM node:20-alpine AS build
WORKDIR /app
# Optional bake-in for non-nginx hosts; Railway prefers runtime VITE_API_URL below.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY package.json ./
RUN npm install
COPY nginx.conf.template ./nginx.conf.template
COPY index.html tsconfig.json vite.config.ts vitest.config.ts eslint.config.mjs ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine AS runner
ENV PORT=80
# Runtime (Railway Variables) — must be the public API origin, e.g. https://….up.railway.app
ENV VITE_API_URL=
ENV NGINX_ENVSUBST_FILTER=^(PORT|VITE_API_URL)$
COPY --from=build /app/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
