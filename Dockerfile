FROM node:20-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY cookies.txt /app/cookies.txt

EXPOSE 6969

CMD ["npm", "run", "start"]