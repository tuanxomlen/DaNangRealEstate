# ==========================================
# DaNangRealEstate - Backend
# Render Docker deployment
# Docker Context: project root
# ==========================================

FROM node:22-bookworm-slim

# Thư mục làm việc bên trong container
WORKDIR /app

# Copy package.json và package-lock.json của backend
COPY backend/package*.json ./

# Cài dependencies production
RUN npm ci --omit=dev

# Copy toàn bộ source backend
COPY backend/src ./src

# Backend Express chạy port 4000
EXPOSE 4000

# Khởi động backend
CMD ["npm", "start"]