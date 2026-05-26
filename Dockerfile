FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install npm dependencies, skip optional and dev dependencies
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && npm list --all --depth=0 --omit=dev \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy source code
COPY . ./

# Run the actor
CMD npm start