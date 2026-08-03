# Island Ledger web — Vite build + nginx
# Build context: apps/web (NOT the monorepo root)
# Railway:
#   Root Directory = apps/web
#   Builder = Dockerfile
#   Dockerfile path = Dockerfile  (or leave default)
#   Set VITE_API_URL=https://<your-api>.up.railway.app (no trailing slash)
#   Leave public networking target port empty (listens on $PORT)
#
# Local / CI:
#   docker build -f apps/web/Dockerfile -t island-web apps/web

FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY package.json ./
# Lockfile lives at monorepo root; install from this package.json alone.
RUN npm install
COPY nginx.conf.template ./nginx.conf.template
COPY index.html tsconfig.json vite.config.ts vitest.config.ts eslint.config.mjs ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine AS runner
# Railway injects PORT; compose sets PORT=80
ENV PORT=80
# Used only when SPA calls /api/* (VITE_API_URL=/api). Absolute VITE_API_URL skips this.
ENV API_UPSTREAM=http://api:3000/
COPY --from=build /app/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# Official nginx image runs envsubst on /etc/nginx/templates/*.template
CMD ["nginx", "-g", "daemon off;"]
