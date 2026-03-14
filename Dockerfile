# ---- Stage 1: Build Vue frontend ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- Stage 2: Install server dependencies ----
FROM node:20-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --production

# ---- Stage 3: Final image ----
FROM node:20-alpine
WORKDIR /app

# Copy server
COPY server/ ./server/
COPY --from=server-deps /app/server/node_modules ./server/node_modules

# Copy built frontend
COPY --from=client-build /app/client/dist ./client/dist

# Copy base-rules.yaml
COPY base-rules.yaml ./base-rules.yaml

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=3000

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "server/src/index.js"]
