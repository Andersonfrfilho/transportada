# syntax=docker/dockerfile:1
# Copyright (c) 2026 Ada Technology. MIT License.
#
# A matriz de estrada hospedada por nós (ADR-0044 §2). O dataset é **assado na imagem**, não montado
# num volume: o `.osrm` é lido na subida e trocá-lo por baixo do processo não recarrega nada, então
# "trocar o dataset é deploy" (runbook `osrm-extract.md`) vira literalmente verdade — e não é preciso
# inventar um caminho de upload de centenas de MB para dentro de um volume do Railway.
#
# O custo honesto: a imagem fica do tamanho do dataset, e o build roda as três etapas do pipeline
# MLD. Por isso a área é a **menor que cobre a operação** — um estado, não o Brasil.

ARG OSRM_VERSION=v6.0.0

FROM ghcr.io/project-osrm/osrm-backend:${OSRM_VERSION} AS dataset

# Sub-região do Geofabrik, `.osm.pbf`. Sem valor padrão de propósito: um default silencioso assaria o
# mapa errado, e mapa errado responde com número plausível (runbook, "extract pequeno demais").
# ⚠️ A URL é presignada (credencial do bucket). O Railway imprime o texto do `RUN` com o `ARG` expandido no
# log de build (vazou assim no map-tiles em 05/11/2026) e não aceita `--mount=type=secret`: o download fica
# num script, com a URL só no ambiente do passo.
ARG OSRM_PBF_URL

WORKDIR /data

# `set -eu` porque o `/bin/sh` desta imagem é BusyBox e o pipeline abaixo precisa parar no primeiro
# erro — um `osrm-extract` que falha e um `osrm-partition` que continua produzem dataset pela metade.
COPY deploy/osrm/fetch-pbf.sh /fetch-pbf.sh

RUN set -eu; \
  sh /fetch-pbf.sh; \
  osrm-extract -p /opt/car.lua /data/area.osm.pbf; \
  osrm-partition /data/area.osrm; \
  osrm-customize /data/area.osrm; \
  rm -f area.osm.pbf

# `mld` aqui casa com `osrm-partition`/`osrm-customize` acima. Servir `mld` sobre um dataset
# processado com `osrm-contract` faz o contêiner subir e recusar toda consulta.
FROM ghcr.io/project-osrm/osrm-backend:${OSRM_VERSION}

COPY --from=dataset /data /data

ENV OSRM_MAX_TABLE_SIZE=2000

# ⚠️ `-i ::` e não o padrão: a rede privada do Railway é IPv6, e o OSRM ligado só em IPv4 fica
# inalcançável por `osrm.railway.internal` — o mesmo motivo pelo qual o healthcheck do `compose.yaml`
# usa `127.0.0.1` em vez de `localhost`.
CMD ["sh", "-c", "osrm-routed --algorithm mld --max-table-size ${OSRM_MAX_TABLE_SIZE} -i :: -p ${PORT:-5000} /data/area.osrm"]
