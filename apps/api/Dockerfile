# Build from monorepo root:
#   docker build -f apps/api/Dockerfile -t mavundla-api .
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN npm ci --workspace=@mavundla/shared --workspace=@mavundla/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY tsconfig.base.json tsconfig.base.json

RUN npm run build -w @mavundla/shared && npm run build -w @mavundla/api

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN useradd --system --uid 10001 --create-home mavundla

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN npm ci --omit=dev --workspace=@mavundla/shared --workspace=@mavundla/api --include-workspace-root \
  && chown -R mavundla:mavundla /app

COPY --from=build --chown=mavundla:mavundla /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=mavundla:mavundla /app/apps/api/dist apps/api/dist

USER mavundla
WORKDIR /app/apps/api
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
