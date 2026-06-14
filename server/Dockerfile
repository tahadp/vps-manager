FROM node:22-alpine AS builder
ENV NODE_ENV=development
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npx prisma migrate deploy && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/proto ./proto

# Coolify injects PORT (e.g. 4567) and GRPC_PORT (e.g. 50051) at runtime.
# EXPOSE documents the ports the container listens on.
EXPOSE 4567
EXPOSE 50051

CMD ["node", "dist/index.js"]
