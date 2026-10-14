# ---------- BUILD STAGE ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Only install deps first (cache friendly)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Generate prisma + build
RUN npx prisma generate
RUN npm run build


# ---------- PRODUCTION STAGE ----------
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Only install production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy Prisma generated client + schema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Copy built app
COPY --from=builder /app/dist ./dist

USER node

EXPOSE 5000

CMD ["node", "dist/server.js"]
