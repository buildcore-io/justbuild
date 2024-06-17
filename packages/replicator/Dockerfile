FROM node:current-slim

WORKDIR /replicator

COPY . .

RUN npm install

RUN npm run build

CMD ["npm", "start"]