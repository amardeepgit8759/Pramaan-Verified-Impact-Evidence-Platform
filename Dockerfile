# One image: the API serves the built web app, so the browser talks to a single origin.
FROM node:22-slim AS build
RUN npm install -g pnpm@10.34.5
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
# Self-contained copy of the API with production dependencies only.
RUN pnpm --filter @pramaan/api deploy --prod --legacy /out/api

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST_DIR=/app/web
WORKDIR /app/api
COPY --from=build --chown=node:node /out/api ./
COPY --from=build --chown=node:node /app/apps/web/dist /app/web
USER node
EXPOSE 8080
# Migrations run on boot (see apps/api/src/index.ts), then the server starts.
CMD ["node", "dist/index.js"]
