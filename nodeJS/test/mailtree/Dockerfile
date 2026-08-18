FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl socat curl ca-certificates procps iproute2 iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /peerTree

RUN npm install --no-audit --no-fund \
      elliptic@6.5.7 \
      bitcoinjs-lib@5.2.0 \
      mysql@2.18.1 \
      mysql2@3.11.5 \
      axios@1.7.9 \
      portscanner@2.2.0 \
      bs58@5.0.0 \
      node-schedule@2.1.1

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
