# syntax=docker/dockerfile:1
# Multi-stage build.  docker build --target api -t topuphub-api .
#                     docker build --target web --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t topuphub-web .
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- API ----------
FROM base AS api-build
COPY apps/api/package*.json ./
RUN npm install --include=dev
COPY apps/api/ ./
RUN npx prisma generate && npm run build

FROM base AS api
ENV NODE_ENV=production
COPY --from=api-build /app/package*.json ./
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/dist ./dist
COPY --from=api-build /app/prisma ./prisma
EXPOSE 4000
# apply migrations, then start API + workers
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

# ---------- Web ----------
FROM base AS web-build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/web/package*.json ./
RUN npm install --include=dev
COPY apps/web/ ./
RUN npm run build

FROM base AS web
ENV NODE_ENV=production
COPY --from=web-build /app ./
EXPOSE 3000
CMD ["npm", "start"]
