# syntax=docker/dockerfile:1
# Copyright (c) 2026 Ada Technology. MIT License.
#
# Mesma escolha do `deploy/gatus`: a configuração viaja dentro da imagem, não num volume nem num
# painel. A imagem não traz `serve` no CMD — sem ele o contêiner sobe e sai calado.
FROM binwiederhier/ntfy:v2.27.0@sha256:f2419f405127afa868f10985c1a41449e673477cee1eb19994339a5ae8b592e7

COPY deploy/ntfy/server.yml /etc/ntfy/server.yml

CMD ["serve"]
