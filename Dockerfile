# Image générique (Railway, Fly.io, VPS…) — Render utilise render.yaml.
# Pas d'instruction VOLUME : Railway la refuse ; le volume se monte sur /data
# depuis le tableau de bord de l'hébergeur.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data/games
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
