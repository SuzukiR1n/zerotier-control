ARG DOCKER_REGISTRY=docker.io
FROM ${DOCKER_REGISTRY}/library/node:24-bookworm-slim
LABEL org.opencontainers.image.title="ZeroTier Control" \
      org.opencontainers.image.description="Self-hosted ZeroTier controller dashboard" \
      org.opencontainers.image.source="https://github.com/SuzukiR1n/zerotier-control"
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/health.js ./scripts/health.js
COPY --chown=node:node scripts/reset-account.js ./scripts/reset-account.js
USER node
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "scripts/health.js"]
CMD ["node", "server/index.js"]
