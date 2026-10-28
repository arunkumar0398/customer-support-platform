FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY api/prisma.config.ts ./api/prisma.config.ts
COPY api/prisma ./api/prisma
COPY web/package.json ./web/package.json
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run db:generate --workspace api
RUN npm run build
RUN node --input-type=module -e "await import('./api/dist/src/generated/prisma/client.js')"
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS api-runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3101
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/api/package.json ./api/package.json
COPY --from=build --chown=node:node /app/api/dist ./api/dist
USER node
EXPOSE 3101
CMD ["node", "api/dist/src/local-server.js"]

FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6 AS web-runtime
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
