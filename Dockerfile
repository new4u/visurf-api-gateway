FROM node:18-alpine

# 安装必要的工具
RUN apk add --no-cache git

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖（允许可选依赖失败）
RUN npm ci --only=production --no-optional || npm install --only=production --no-optional

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p data

# 暴露端口
EXPOSE 4000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
CMD ["npm", "start"]
