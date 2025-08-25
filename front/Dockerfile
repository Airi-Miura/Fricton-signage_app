# --- build stage (Node で Vite ビルド) ---
FROM node:20-alpine AS builder
WORKDIR /app

# まず依存だけコピーして install をキャッシュ
COPY fricton-signage/package*.json ./fricton-signage/
WORKDIR /app/fricton-signage
RUN npm ci

# 残りのソースをコピーしてビルド
COPY fricton-signage/ ./
RUN npm run build        # → dist/ が生成される

# --- run stage (Nginx で配信) ---
FROM nginx:alpine
# ビルド成果物をドキュメントルートへ
COPY --from=builder /app/fricton-signage/dist/ /usr/share/nginx/html/
# Nginx 設定を差し替え
COPY nginx.conf /etc/nginx/conf.d/default.conf
