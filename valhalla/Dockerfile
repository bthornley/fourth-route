FROM ghcr.io/gis-ops/docker-valhalla/valhalla:latest

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8002

ENTRYPOINT ["/start.sh"]
