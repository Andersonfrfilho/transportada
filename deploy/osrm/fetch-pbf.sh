#!/bin/sh
# Copyright (c) 2026 Ada Technology. MIT License.
# Baixa o .osm.pbf do OSRM para /data. Lê a URL do ambiente (ARG OSRM_PBF_URL) para ela não aparecer no log de build.
set -eu
if [ -z "${OSRM_PBF_URL:-}" ]; then
  echo 'OSRM_PBF_URL é obrigatório — ver docs/runbooks/osrm-extract.md' >&2
  exit 1
fi
wget -q -O /data/area.osm.pbf "$OSRM_PBF_URL"
