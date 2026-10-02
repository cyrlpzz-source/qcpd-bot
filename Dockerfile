FROM node:22-bookworm

WORKDIR /app

# Install everything needed to build @discordjs/opus
RUN apt-get update \
    && apt-get install -y \
        python3 \
        make \
        g++ \
        gcc \
        libc6-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install npm dependencies
COPY package*.json ./

RUN npm ci --include=prod --no-audit --no-fund

# Copy bot
COPY . .

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

CMD ["node", "index.js"]
