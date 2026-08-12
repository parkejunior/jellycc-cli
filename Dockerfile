# Build
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun build ./src/index.ts --compile --outfile /app/jellycc

# Runtime
FROM alpine:latest

RUN apk add --no-cache ffmpeg

COPY --from=builder /app/jellycc /usr/local/bin/jellycc

WORKDIR /media

ENTRYPOINT ["jellycc"]
