FROM ghcr.io/gis-ops/docker-valhalla/valhalla:latest

USER root
COPY start.sh /start.sh
RUN chmod +x /start.sh \
    && mkdir -p /custom_files \
    && chown -R valhalla:valhalla /custom_files
USER valhalla

EXPOSE 8002

ENTRYPOINT ["/start.sh"]
