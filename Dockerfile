FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build -w @horizon-signai/web
ENV NODE_ENV=production PORT=3000 WEB_DIST=/app/apps/web/dist
EXPOSE 3000
# --start-interval: mientras arranca se mide cada segundo, así el deploy pasa a la otra copia apenas esta atiende.
HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=60s --start-interval=1s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# node directo (no npx): así el SIGTERM de `docker stop` le llega al proceso y hace el apagado ordenado.
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
