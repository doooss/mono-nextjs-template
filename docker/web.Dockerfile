# syntax=docker/dockerfile:1
# OPTIONAL deploy artifact — Next.js standalone image for apps/web.
# Build from repo root:  docker build -f docker/web.Dockerfile -t web:local .
# NEXT_PUBLIC_* 는 빌드 시 번들에 인라인된다 — 필요하면 build 단계에 `ARG NEXT_PUBLIC_X` 를 추가
# (ARG 는 RUN 에 env 로 전달된다. `ENV X=${X}` 로 옮기면 미지정 시 빈 문자열이 인라인되니 쓰지 않는다).

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

# 1) prune the workspace down to `web` and its internal deps
FROM base AS prune
COPY . .
# turbo 버전 = 루트 package.json devDependencies 와 맞춘다 (재현 가능한 prune)
RUN pnpm dlx turbo@2.11.13 prune web --docker

# 2) install deps from the pruned lockfile, then build
FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=true
RUN pnpm turbo run build --filter=web

# 3) minimal runtime: standalone server + static assets
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
