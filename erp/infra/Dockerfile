# syntax=docker/dockerfile:1.7
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# The optional PEM is a BuildKit secret; TLS verification is never disabled.
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -s /run/secrets/proxy_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --ignore-scripts --strict-ssl=true; \
    else npm ci --ignore-scripts --strict-ssl=true; fi
COPY tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY infra ./infra
COPY scripts ./scripts
COPY tests ./tests
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA KNABA_BUILD_CONTEXT=PINNED_SOURCE
RUN node -e "if(!/^[a-f0-9]{40}$/.test(process.env.GIT_SHA||'')||/^0{40}$/.test(process.env.GIT_SHA))throw new Error('EXACT_RELEASE_SHA_REQUIRED')" && npm run build

FROM node:24.19.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.title="KNABA DE" org.opencontainers.image.revision=$GIT_SHA
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
# tsx is retained for the versioned migration and bootstrap entry points.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/infra ./infra
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/scripts ./scripts
RUN mkdir -p /app/private && chown node:node /app/private
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/ready',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.mjs"]
