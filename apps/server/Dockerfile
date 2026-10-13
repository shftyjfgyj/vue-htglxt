# 基础镜像与 npm 源都可通过 build arg 覆盖（国内网络建议指向加速源）：
#   --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim
#   --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- 构建阶段 ----------
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmmirror.com
WORKDIR /app
COPY package*.json ./
RUN npm config set registry $NPM_REGISTRY && npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- 运行阶段 ----------
# 用 Debian slim 而不是 alpine：fonts-noto-cjk 会装到
# /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc，正好命中 report.service.ts 的候选路径，
# PDF 中文报表不会因为找不到字体而报错。
FROM ${NODE_IMAGE}
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NODE_ENV=production \
    TZ=Asia/Shanghai
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-cjk tzdata curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm config set registry $NPM_REGISTRY && npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY sql ./sql
# 上传目录（生产用 volume 挂载持久化）
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/health/live || exit 1
CMD ["node", "dist/index.js"]
