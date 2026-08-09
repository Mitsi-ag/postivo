# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- build ----------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S postivo && adduser -S postivo -G postivo
COPY --from=builder --chown=postivo:postivo /app/.next/standalone ./
COPY --from=builder --chown=postivo:postivo /app/.next/static ./.next/static
COPY --from=builder --chown=postivo:postivo /app/public ./public
USER postivo
EXPOSE 3000
CMD ["node", "server.js"]
