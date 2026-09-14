# syntax=docker/dockerfile:1
# O cliente tem de ser o do servidor: `pg_restore` mais antigo que o Postgres 18 recusa o dump, e um
# refresh que só falha no domingo de madrugada não avisa ninguém a tempo. Mesmo digest do
# `deploy/backup/`, pelo mesmo motivo — a imagem que dumpou ontem é a que restaura hoje.
FROM postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15

# `curl` fala S3 por SigV4 nativo — evita arrastar Python e a AWS CLI para dentro de uma imagem que
# roda uma vez por semana. Mesma escolha do backup. `jq` lê a resposta do Admin API do Keycloak no
# religamento das identidades — JSON com `sed` quebra no primeiro e-mail com aspas.
RUN apk add --no-cache bash ca-certificates curl jq openssl

# O script acha o SQL do religamento no próprio diretório: os dois viajam juntos.
COPY deploy/staging-refresh/staging-refresh.sh deploy/staging-refresh/rebind-identities.sql deploy/staging-refresh/neutralize-external.sql /usr/local/lib/staging-refresh/
RUN chmod 0555 /usr/local/lib/staging-refresh/staging-refresh.sh \
  && chmod 0444 /usr/local/lib/staging-refresh/rebind-identities.sql /usr/local/lib/staging-refresh/neutralize-external.sql

USER postgres
ENTRYPOINT ["/usr/local/lib/staging-refresh/staging-refresh.sh"]
