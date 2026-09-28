# CodeArena image.
#  * Default (Railway, Fly.io, Render, a single `docker run`): web + judge in one container.
#    The process runs as root only so the sandbox can drop every submission to its own
#    unprivileged uid (20000 + worker); data is owner-only, so submissions cannot read it.
#  * docker-compose.yml splits it into an unprivileged web container and a network-less judge.
FROM node:24-bookworm-slim

# Toolchains for the judge. Go/Rust/PyPy are optional to keep the image smaller:
#   docker build --build-arg EXTRA_LANGS="golang-go rustc pypy3" .
ARG EXTRA_LANGS=""
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 gcc g++ libc6-dev openjdk-17-jdk-headless ca-certificates ${EXTRA_LANGS} \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .

RUN useradd --system --uid 10001 --home /app app \
 && mkdir -p /data && chown app:app /data && chmod 700 /data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    SANDBOX_PYTHON=python3 \
    SANDBOX_UID=20000 \
    SANDBOX_GID=65534 \
    JUDGE_WORK_DIR=/tmp/codearena-judge \
    AUTO_SEED=true \
    AUTO_IMPORT_ARCHIVE=true \
    ARCHIVE_AUTO_SYNC_HOURS=24 \
    TRUST_PROXY=true

EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
