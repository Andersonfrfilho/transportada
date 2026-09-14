# syntax=docker/dockerfile:1
# O cliente tem de ser o do servidor: `pg_restore` mais antigo que o Postgres 18 recusa o dump. Mesmo
# digest do `deploy/backup/` — a imagem que dumpou é a que restaura, e o Postgres efêmero que recebe
# o restore é o `initdb` desta mesma imagem.
FROM postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15

# `curl` fala S3 por SigV4 nativo; `jq` lê o manifesto sem `sed` frágil. Roda uma vez por mês.
RUN apk add --no-cache bash ca-certificates curl jq openssl

COPY deploy/restore-test/restore-test.sh /usr/local/bin/restore-test.sh
RUN chmod 0555 /usr/local/bin/restore-test.sh

# `initdb` recusa root, e o banco efêmero nasce com o dono deste processo.
USER postgres
ENTRYPOINT ["/usr/local/bin/restore-test.sh"]
