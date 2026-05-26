FROM apify/actor-node:20

# Install Python3, pip, and yt-dlp for audio download fallback
RUN apt-get update -qq \
    && apt-get install -y -qq python3 python3-pip \
    && pip3 install yt-dlp \
    && apt-get clean -qq \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and TypeScript config
COPY package*.json tsconfig.json ./

# Install all dependencies including dev for TypeScript compilation
RUN npm ci --include=dev

# Copy source code
COPY . ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --omit=dev \
    && echo "Production dependencies:" \
    && npm list --all --depth=0 --omit=dev

# Run the actor
CMD npm start