FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY db.js server.js index.html admin.html login.html inventory.html finance.html finance-categories.html finance-report.html reservations.html clients.html orders.html integrations.html network.html delivery.html admin.js style.css app.js portal.js login.js catalog-seed.js ./
COPY assets ./assets
COPY staff-profile.js staff-audit.js staff-phone-fields.js staff-sensitive-fields.js staff-admin-card.js staff-telegram-link.js vip-deposit.js vip-deposit-ui.js ./
COPY scripts ./scripts
COPY migrations ./migrations
EXPOSE 3000
CMD ["node","server.js"]
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://localhost:3000/api/health || exit 1
