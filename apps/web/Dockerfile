# 前端生产镜像：Node 构建 -> nginx 托管
# 基础镜像与 npm 源可通过 build arg 覆盖（国内网络建议指向加速源）
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmmirror.com
WORKDIR /app
COPY package*.json ./
RUN npm config set registry $NPM_REGISTRY && npm ci --ignore-scripts
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
# public/ 里有 _redirects（SPA 回退）与 seed/ 分类封面，
# 少了这行，构建出的站点会没有封面、深层路由也可能 404
COPY public ./public
COPY .env.production ./
RUN npm run build

FROM ${NGINX_IMAGE}
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
