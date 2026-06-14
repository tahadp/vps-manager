FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build-time env (consumed by Next.js during `next build`)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_RUSTDESK_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_RUSTDESK_URL=$NEXT_PUBLIC_RUSTDESK_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Coolify injects PORT (e.g. 5674) at runtime; HOSTNAME=0.0.0.0 binds on all interfaces.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone build copies the minimal runtime
COPY --from=builder /app/.next/standalone ./
# Static assets and public folder must be copied manually
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Coolify's PORT env (e.g. 5674) overrides the EXPOSE 3000 below; document both for clarity.
EXPOSE 3000
EXPOSE 5674

CMD ["node", "server.js"]
