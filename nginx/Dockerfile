FROM nginx:latest

# Create directory for Let's Encrypt challenges
RUN mkdir -p /var/lib/letsencrypt

# Copy custom NGINX config
COPY default.conf /etc/nginx/conf.d/default.conf
