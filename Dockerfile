FROM node:22-alpine

WORKDIR /app

# Alpine এ openssl for caching
RUN apk add --no-cache openssl

# Dependencies
COPY package*.json ./

# Prisma files (needed for generate)
COPY prisma ./prisma
COPY prisma.config.js ./

RUN npm ci --omit=dev

COPY . .

# Entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Logs
RUN mkdir -p logs

EXPOSE 3050

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "index.js"]