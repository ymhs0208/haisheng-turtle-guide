FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
COPY display/package.json display/package.json
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=43125
EXPOSE 43125
CMD ["node", "server/dist/index.js"]
