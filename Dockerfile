FROM apify/actor-node:20

RUN apk add --no-cache python3 py3-pip ffmpeg \
    && pip3 install --break-system-packages -U yt-dlp

COPY package*.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

RUN npm prune --omit=dev

CMD ["npm", "start"]
