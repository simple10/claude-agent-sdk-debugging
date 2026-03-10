FROM oven/bun:latest

USER root

WORKDIR /capture

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY package.json /capture/package.json
COPY intercept-server.ts /capture/intercept-server.ts
COPY capture.ts /capture/capture.ts

ENTRYPOINT ["/entrypoint.sh"]
