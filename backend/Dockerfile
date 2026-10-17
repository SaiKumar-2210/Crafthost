FROM node:22-alpine
RUN apk add --no-cache docker-cli
ENV NODE_ENV=production
WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data/servers /data/versions /data/uploads
ENV SERVERS_DIR=/data/servers VERSIONS_DIR=/data/versions UPLOADS_DIR=/data/uploads
# Docker socket access grants host-level control; run this trusted management agent as root.
USER root
EXPOSE 4000
CMD ["node", "daemon.js"]
