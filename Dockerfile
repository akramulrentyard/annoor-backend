# ============================================
# Base Image
# ============================================
FROM node:22-alpine

# ============================================
# Install system dependencies
# ============================================
RUN apk add --no-cache wget openssl

# ============================================
# Working Directory
# ============================================
WORKDIR /app

# ============================================
# Copy package files
# ============================================
COPY package*.json ./

# ============================================
# Copy Prisma files (needed for generate)
# ============================================
COPY prisma ./prisma
COPY prisma.config.js ./

# ============================================
# Install dependencies
# (postinstall → prisma generate)
# ============================================
RUN npm install --omit=dev && \
    npm cache clean --force

# ============================================
# Copy application code
# ============================================
COPY . .

# ============================================
# Make entrypoint executable
# ============================================
RUN chmod +x /app/docker/entrypoint.sh

# ============================================
# Expose Port
# ============================================
EXPOSE 3050

# ============================================
# Health Check
# ============================================
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3050/ || exit 1

# ============================================
# Entrypoint
# ============================================
ENTRYPOINT ["/app/docker/entrypoint.sh"]

# ============================================
# Default Command (passed to entrypoint)
# ============================================
CMD ["node", "index.js"]