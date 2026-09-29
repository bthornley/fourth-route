FROM ghcr.io/gis-ops/docker-valhalla/valhalla:latest

USER root

# Install nginx as reverse proxy to handle HTTP/2 → HTTP/1.1 translation
RUN apt-get update && apt-get install -y --no-install-recommends nginx && rm -rf /var/lib/apt/lists/*

# nginx config: listen on 8002 externally, proxy to Valhalla on 8003 internally
RUN echo 'server { \n\
    listen 8002; \n\
    location / { \n\
        proxy_pass http://127.0.0.1:8003; \n\
        proxy_http_version 1.1; \n\
        proxy_set_header Connection ""; \n\
        proxy_set_header Host "127.0.0.1:8003"; \n\
        proxy_set_header X-Forwarded-For ""; \n\
        proxy_read_timeout 60s; \n\
        proxy_connect_timeout 10s; \n\
    } \n\
}' > /etc/nginx/sites-enabled/valhalla && \
    rm -f /etc/nginx/sites-enabled/default

COPY start.sh /start.sh
RUN chmod +x /start.sh \
    && mkdir -p /custom_files \
    && chown -R valhalla:valhalla /custom_files

EXPOSE 8002

ENTRYPOINT ["/start.sh"]
