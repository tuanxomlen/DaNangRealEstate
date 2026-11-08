# =========================
# Stage 1: Build React/Vite
# =========================
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Cài dependency
COPY package*.json ./
RUN npm ci

# Copy source frontend
COPY . .

# Build production
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# Kiểm tra chắc chắn dist đã được tạo
RUN test -f /app/dist/index.html


# =========================
# Stage 2: Nginx
# =========================
FROM nginx:1.27-alpine

# Cấu hình reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy frontend production
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK \
    --interval=30s \
    --timeout=3s \
    --start-period=10s \
    --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
