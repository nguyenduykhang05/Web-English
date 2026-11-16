FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci
COPY . .
RUN npm run build --workspaces --if-present
EXPOSE 3000
CMD ["npm", "run", "dev"]
