# syntax=docker/dockerfile:1
# Copyright (c) 2026 Ada Technology. MIT License.
#
# O mapa de rua do painel (ADR-0044 §6). Mesma forma do `deploy/osrm/Dockerfile`, e pela mesma razão:
# o dataset é **assado na imagem**, não montado em volume — trocar o mapa é deploy, e não existe
# caminho de upload de centenas de MB para dentro de um volume do Railway.
#
# ⚠️ **Isto roda aqui porque não roda na máquina de ninguém.** O planetiler pede vários GB de disco
# de trabalho e memória para processar; o builder do Railway tem, um laptop em uso normal não tem.
# Foi exatamente onde a geração local morreu, com `No space left on device`.
#
# ⚠️ A ADR previa o arquivo **no bucket privado**, lido por faixa de bytes do nosso domínio. Isto
# aqui é o degrau anterior e mais barato: serviço próprio, arquivo dentro da imagem, `Range` no
# servidor. Migrar para o bucket continua valendo — o que muda é de onde o byte vem, e o cliente não
# sabe a diferença.

ARG PLANETILER_VERSION=latest

FROM ghcr.io/onthegomap/planetiler:${PLANETILER_VERSION} AS dataset

# Sub-região do Geofabrik, `.osm.pbf` — o **mesmo** arquivo que alimenta o OSRM. Sem valor padrão de
# propósito: mapa e rota descrevendo regiões diferentes é a tela e o roteirizador discordando.
ARG MAP_PBF_URL

WORKDIR /data

# ⚠️ O entrypoint da imagem é jib (`java -cp @/app/jib-classpath-file …`), e não um jar solto:
# `java -jar /planetiler.jar` falha com "Unable to access jarfile" — e falharia só aqui, no build
# remoto, depois de baixar o `.pbf` inteiro.
#
# `--download` busca as fontes auxiliares (contorno de lago, polígono de água, natural earth) que o
# esquema OpenMapTiles exige; sem elas o processo aborta antes de ler o `.pbf`.
RUN set -eu; \
  if [ -z "${MAP_PBF_URL:-}" ]; then \
    echo 'MAP_PBF_URL é obrigatório — ver docs/runbooks/map-tiles.md' >&2; exit 1; \
  fi; \
  wget -q -O area.osm.pbf "${MAP_PBF_URL}"; \
  java -cp @/app/jib-classpath-file com.onthegomap.planetiler.Main \
    --osm-path=/data/area.osm.pbf --output=/data/area.pmtiles \
    --force --download --nodemap-type=array; \
  rm -rf /data/area.osm.pbf /data/sources /data/tmp

# Os glifos do rótulo. Sem eles o MapLibre **não desenha texto nenhum** — e mapa de roteiro sem nome
# de cidade obriga quem confere a reconhecer a região pelo formato do rio.
#
# ⚠️ A fonte é embarcada, não buscada de CDN em tempo de execução: `font-src` da CSP é `'self'`, e a
# razão da ADR-0044 §6 vale para o glifo como vale para a telha.
FROM alpine:3.20 AS fonts

RUN set -eu; \
  apk add --no-cache curl unzip; \
  mkdir -p /fonts; \
  curl -sL -o /tmp/fonts.zip \
    https://github.com/openmaptiles/fonts/releases/download/v2.0/v2.0.zip; \
  unzip -q /tmp/fonts.zip -d /tmp/fonts; \
  cp -r "/tmp/fonts/Noto Sans Regular" /fonts/; \
  rm -rf /tmp/fonts.zip /tmp/fonts

FROM oven/bun:1.3.14-alpine

WORKDIR /app
COPY --from=dataset /data/area.pmtiles /app/map-tiles/area.pmtiles
COPY --from=fonts /fonts /app/map-tiles/fonts
COPY deploy/map-tiles/server.ts /app/server.ts

ENV PORT=8080
CMD ["bun", "./server.ts"]
