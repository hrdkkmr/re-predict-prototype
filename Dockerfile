FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=4173
ENV HOST=0.0.0.0
EXPOSE 4173
CMD ["node", "server.js"]
