# syntax=docker/dockerfile:1.7
# Build infra/Dockerfile once with the exact Git SHA, then derive this worker.
# Example: --build-arg API_IMAGE=knaba-de-api:<exact-sha>
ARG API_IMAGE
FROM ${API_IMAGE}
LABEL org.opencontainers.image.title="KNABA DE worker"
ENV WORKER_HEARTBEAT_FILE=/tmp/knaba-worker-heartbeat
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "try{if(Date.now()-require('node:fs').statSync(process.env.WORKER_HEARTBEAT_FILE).mtimeMs>30000)process.exit(1);}catch{process.exit(1);}"
CMD ["node", "dist/worker.mjs"]
