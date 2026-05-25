FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
USER node
ENTRYPOINT ["./docker-entrypoint.sh"]
