FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM node:22-alpine AS backend-dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=backend-dependencies /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY --from=frontend-build /app/dist ./dist
RUN mkdir -p /app/backend/servers /app/backend/versions /app/backend/uploads \
    && addgroup -S crafthost && adduser -S -G crafthost crafthost \
    && chown -R crafthost:crafthost /app/backend/servers /app/backend/versions /app/backend/uploads
USER crafthost
EXPOSE 3000
CMD ["node", "backend/control.js"]
