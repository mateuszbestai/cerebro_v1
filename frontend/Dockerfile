FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# Production image just keeps build output
FROM alpine:3.19 AS prod
WORKDIR /app
COPY --from=build /app/dist ./dist
