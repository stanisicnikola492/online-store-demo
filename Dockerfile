FROM node:24-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma's query engine looks for OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Dev dependencies are needed here: tailwind/postcss/prisma for the build, and tsx for docker/start.sh.
# NODE_ENV is only switched to production once everything that needs them has run.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
ENV NODE_ENV=production
RUN npm run build

EXPOSE 4500

CMD ["sh", "./docker/start.sh"]
