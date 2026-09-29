FROM ghcr.io/gis-ops/docker-valhalla/valhalla:latest

USER root

# Install nginx as reverse proxy
RUN apt-get update && apt-get install -y --no-install-recommends nginx && rm -rf /var/lib/apt/lists/*

# nginx listens on 8080, proxies to Valhalla on 8002 (its default port)
RUN echo 'server { \n\
    listen 8080; \n\
    location / { \n\
        proxy_pass http://127.0.0.1:8002; \n\
        proxy_http_version 1.0; \n\
        proxy_set_header Host "localhost"; \n\
        proxy_set_header Connection ""; \n\
        proxy_read_timeout 60s; \n\
    } \n\
}' > /etc/nginx/sites-enabled/valhalla && \
    rm -f /etc/nginx/sites-enabled/default

COPY start.sh /start.sh
RUN chmod +x /start.sh \
    && mkdir -p /custom_files \
    && chown -R valhalla:valhalla /custom_files

EXPOSE 8080

ENTRYPOINT ["/start.sh"]
