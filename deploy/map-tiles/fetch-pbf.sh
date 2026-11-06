#!/bin/sh
# Copyright (c) 2026 Ada Technology. MIT License.
# Baixa o .osm.pbf do map-tiles. Lê a URL do ambiente (ARG MAP_PBF_URL) para ela não aparecer no log de build.
set -eu
if [ -z "${MAP_PBF_URL:-}" ]; then
  echo 'MAP_PBF_URL é obrigatório — ver docs/runbooks/map-tiles.md' >&2
  exit 1
fi
apk add --no-cache curl >/dev/null
curl -fsSL -o /area.osm.pbf "$MAP_PBF_URL"
