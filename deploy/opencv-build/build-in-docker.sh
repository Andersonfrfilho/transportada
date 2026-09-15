#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
# Roda o build.sh dentro da imagem oficial do Emscripten, fixada por digest (ADR-0065 §2).
# Uso: deploy/opencv-build/build-in-docker.sh <diretório-de-saída-relativo-à-raiz>
set -euo pipefail

# emscripten/emsdk:4.0.20 — digest da lista de manifestos (linux/amd64 e linux/arm64).
EMSDK_IMAGE='emscripten/emsdk@sha256:460fff8f8ac87e11b16447fbd66538a686eafa0e4fb977aa0989ed19fe2079f7'

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
OUTPUT_DIRECTORY="${1:?informe o diretório de saída, relativo à raiz do repositório}"

# Roda como root porque o cache do Emscripten da imagem só é gravável por ele; a saída volta para o
# dono do checkout no fim.
docker run --rm \
  --volume "$REPOSITORY_ROOT:/repository" \
  --workdir /repository \
  "$EMSDK_IMAGE" \
  bash -c "deploy/opencv-build/build.sh /tmp/opencv-build '/repository/$OUTPUT_DIRECTORY/opencv.js' \
    && chown -R $(id -u):$(id -g) '/repository/$OUTPUT_DIRECTORY'"
