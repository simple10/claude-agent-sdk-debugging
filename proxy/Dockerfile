FROM mitmproxy/mitmproxy:latest

# Generate CA cert on first run, then start mitmweb in dual mode
# mitmproxy runs as UID 1000 by default in this image
CMD ["mitmweb", \
     "--mode", "regular@8080", \
     "--mode", "transparent@8085", \
     "--web-host", "0.0.0.0", \
     "--web-port", "8081", \
     "--set", "stream_large_bodies=1"]
