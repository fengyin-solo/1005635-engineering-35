FROM node:20-alpine
WORKDIR /srv/web
COPY package.json ./
RUN npm install
COPY . .
# 用镜像内的种子代码重新生成清单，保证版本对得上（脚本幂等，产物一致）
RUN node scripts/setup.mjs
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
