FROM node:22-bookworm

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install @discordjs/opus@0.10.0 opusscript@0.0.8 --save

RUN node -e "console.log('Opus:', require.resolve('@discordjs/opus'))"

COPY . .

RUN apt-get update \
    && apt-get install -y python3 curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

CMD ["node", "index.js"]
