# Backend agent API. Uses a full (non-slim) image + installs Chromium with its
# system deps so Playwright is available. NOTE: the *live discovery* feature
# launches a HEADED browser and is intended to be run natively on your machine;
# in a container the manual-scenario path (analyze / generate / run) works fully.
FROM node:20-bookworm
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
# Install the Chromium build matching the pinned Playwright version, plus OS deps
RUN npx playwright install --with-deps chromium
COPY . .
EXPOSE 5001
CMD ["node", "server.js"]
