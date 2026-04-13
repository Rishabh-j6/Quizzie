# ── Stage 1: Build the React app ───────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve with Nginx ───────────────────────────────────────────────
FROM nginx:1.25-alpine

# Install envsubst (part of gettext)
RUN apk add --no-cache gettext

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config template (processed by custom entrypoint)
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Use a custom entrypoint to run envsubst on ONLY $BACKEND_URL,
# leaving nginx's own $host, $remote_addr etc. untouched.
COPY docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

EXPOSE 80

CMD ["/docker-entrypoint-custom.sh"]
