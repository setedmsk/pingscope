FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates iputils-ping \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.mjs ./server.mjs
COPY public ./public

ENV NODE_ENV=production
EXPOSE 10000

CMD ["npm", "start"]
