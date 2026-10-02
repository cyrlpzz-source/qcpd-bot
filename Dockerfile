FROM node:22-bookworm

WORKDIR /app

COPY package*.json ./

# Install all dependencies
RUN npm install --include=optional

# Explicitly install Opus fallback and verify it exists
RUN npm install opusscript@0.0.8 --save \
    && node -e "console.log('Opus fallback:', require.resolve('opusscript'))"

COPY . .

RUN apt-get update \
    && apt-get install -y python3 curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

CMD ["node", "index.js"]
