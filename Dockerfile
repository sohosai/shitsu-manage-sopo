FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1 AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Tokyo

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "dist/server.js"]
