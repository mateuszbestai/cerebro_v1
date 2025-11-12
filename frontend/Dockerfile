FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
# Use npm install to allow lockfile updates during build (we pin via package-lock in repo when available)
RUN npm install
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=8192
RUN npm run build

# Production stage - serve the built files with a static server
FROM nginx:alpine AS prod
WORKDIR /usr/share/nginx/html

# Remove default nginx static files
RUN rm -rf ./*

# Copy built files from build stage
COPY --from=build /app/dist .

# Add custom nginx config for SPA routing
RUN echo 'server { \
    listen 3000; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        return 404; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Remove the default server block
RUN sed -i '/listen       80;/,/^}/d' /etc/nginx/nginx.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
