FROM node:22-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y \
        python3 \
        make \
        g++ \
        gcc \
        libc6-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --include=prod --no-audit --no-fund

COPY . .

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

CMD ["node", "index.js"]
