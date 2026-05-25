FROM node:20-bookworm-slim

ENV NODE_ENV=production

FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PATH="/usr/local/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip python3-dev ca-certificates curl \
    chromium-browser libvips libvips-dev pkg-config \
  && pip3 install --no-cache-dir --break-system-packages -U yt-dlp pycryptodomex brotli cffi cython websockets pycurl \
  && ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp || true \
  && which yt-dlp || pip3 install --no-cache-dir --break-system-packages --force-reinstall yt-dlp \
  && npm install -g yt-dlp-js puppeteer 2>/dev/null || npm install -g puppeteer \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY cookies.txt /app/cookies.txt

EXPOSE 6969

CMD ["npm", "run", "start"]