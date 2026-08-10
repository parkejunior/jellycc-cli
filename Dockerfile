FROM oven/bun:1-debian

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/jellycc
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

WORKDIR /media

ENTRYPOINT ["bun", "run", "/opt/jellycc/src/index.ts"]
