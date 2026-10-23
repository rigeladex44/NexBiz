# syntax=docker/dockerfile:1
FROM node:22-bookworm AS build
WORKDIR /app
# Keep layer count small for development environments using Docker's vfs driver.
COPY . .
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true && npm run db:generate && npm run build
FROM node:22-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 4000
CMD ["npm", "run", "start", "-w", "@nexalid/web"]
