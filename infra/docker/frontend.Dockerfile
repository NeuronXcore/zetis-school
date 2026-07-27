# Frontend Vite — image PROD-LIKE : build statique servi par nginx (le dev tourne en natif).
# Paramétré par APP (frontend-massimo | frontend-papa). Build depuis la racine :
#   docker build -f infra/docker/frontend.Dockerfile --build-arg APP=frontend-massimo -t zetis-massimo .
#
# --- Étape 1 : build du bundle Vite (monorepo pnpm) ---
FROM node:20-bookworm-slim AS build
ARG APP
# URL du backend/frontends bakées au build (défaut = ports miroir du dev, cf. authClient/LoginPage).
ARG VITE_API_URL=http://localhost:8000
ARG VITE_MASSIMO_URL=http://localhost:5173
ARG VITE_PAPA_URL=http://localhost:5174
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_MASSIMO_URL=${VITE_MASSIMO_URL} \
    VITE_PAPA_URL=${VITE_PAPA_URL}
RUN corepack enable
WORKDIR /repo
COPY . /repo
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@zetis/${APP}" build

# --- Étape 2 : service statique nginx ---
FROM nginx:1.27-alpine
ARG APP
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/${APP}/dist /usr/share/nginx/html
EXPOSE 80
