FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p data logs
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/zhuomeng.db
EXPOSE 8080
VOLUME ["/app/data"]
# 建表(幂等) + 种子(幂等) + 启动纯 API
CMD ["sh", "-c", "node src/db/migrate.js up && node src/db/migrate.js seed && node src/server.js"]
