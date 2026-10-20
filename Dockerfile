FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY *.cjs *.js ./
COPY *.html style.css ./
COPY assets ./assets
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV NODE_ENV=production BUSANGI_BIND=0.0.0.0 BUSANGI_DATA_DIR=/app/data PORT=4173
USER node
EXPOSE 4173
CMD ["node", "market-server.cjs"]
