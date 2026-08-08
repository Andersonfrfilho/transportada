# syntax=docker/dockerfile:1
# O cliente tem de ser o do servidor: `pg_dump` mais antigo que o Postgres 18 recusa a conexão, e
# um backup que só falha no dia do incidente não é backup.
FROM postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15

# `curl` fala S3 por SigV4 nativo desde a 7.75 — evita arrastar Python e a AWS CLI para dentro de
# uma imagem que roda cinco minutos por dia.
RUN apk add --no-cache bash ca-certificates curl openssl

COPY deploy/backup/backup.sh /usr/local/bin/backup.sh
RUN chmod 0555 /usr/local/bin/backup.sh

USER postgres
ENTRYPOINT ["/usr/local/bin/backup.sh"]
