FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY db.js server.js index.html admin.html login.html inventory.html finance.html reservations.html admin.js style.css app.js portal.js login.js ./
COPY assets ./assets
EXPOSE 3000
CMD ["node","server.js"]
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:3000/api/health || exit 1
