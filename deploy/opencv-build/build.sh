#!/usr/bin/env bash
# Copyright (c) 2026 Ada Technology. MIT License.
# Build próprio do OpenCV.js da medida pela câmera (spec 152, ADR-0065).
# Uso: deploy/opencv-build/build.sh <diretório-de-trabalho> <arquivo-de-saída>
# Canônico: deploy/opencv-build/build-in-docker.sh (imagem do Emscripten fixada por digest).
set -euo pipefail

EMSDK_COMMIT='33aee63cfc6362558d3adcc68a333035e75a391f'
EMSCRIPTEN_VERSION='4.0.20'
OPENCV_TAG='5.0.0'
OPENCV_COMMIT='40738fb16ceddb5fb3fea747585f7ce6abb0605b'

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
mkdir -p "${1:?informe o diretório de trabalho}"
WORK_DIRECTORY="$(cd "$1" && pwd -P)"
OUTPUT_FILE="${2:?informe o arquivo de saída}"
mkdir -p "$(dirname "$OUTPUT_FILE")"
OUTPUT_DIRECTORY="$(cd "$(dirname "$OUTPUT_FILE")" && pwd -P)"
cd "$WORK_DIRECTORY"

# Na imagem oficial o emcc da versão certa já está no PATH; fora dela, o emsdk é baixado e fixado.
if ! command -v emcc >/dev/null || ! emcc --version | head -1 | grep -q " $EMSCRIPTEN_VERSION "; then
  if [[ ! -d emsdk ]]; then
    git clone -q https://github.com/emscripten-core/emsdk.git emsdk
  fi
  git -C emsdk fetch -q --depth 1 origin "$EMSDK_COMMIT"
  git -C emsdk -c advice.detachedHead=false checkout -q "$EMSDK_COMMIT"
  ./emsdk/emsdk install "$EMSCRIPTEN_VERSION" >/dev/null
  ./emsdk/emsdk activate "$EMSCRIPTEN_VERSION" >/dev/null
  # shellcheck disable=SC1091
  source ./emsdk/emsdk_env.sh >/dev/null 2>&1
fi
EMSDK_DIRECTORY="$(cd "${EMSDK:?emsdk sem EMSDK no ambiente}" && pwd -P)"

if [[ ! -d opencv ]]; then
  git clone -q --depth 1 --branch "$OPENCV_TAG" https://github.com/opencv/opencv.git opencv
fi
if [[ "$(git -C opencv rev-parse HEAD)" != "$OPENCV_COMMIT" ]]; then
  echo "OPENCV_BUILD_UNEXPECTED_COMMIT" >&2
  exit 1
fi
SOURCE_DATE_EPOCH="$(git -C opencv log -1 --format=%ct)"
export SOURCE_DATE_EPOCH

# DYNAMIC_EXECUTION=0: o embind não monta função por `new Function`, e a CSP (sem 'unsafe-eval')
# deixa o módulo iniciar. Os prefix-map tiram do __FILE__ os caminhos da máquina que compilou.
# Módulos: só objdetect (aruco) e as dependências obrigatórias dele, mais photo, que o
# core_bindings.cpp exige sem condição (`using namespace cv::segmentation`).
BUILD_OPTIONS=(
  --build_wasm
  --config "$SCRIPT_DIRECTORY/opencv_js.config.py"
  --build_flags="-s DYNAMIC_EXECUTION=0 -ffile-prefix-map=$WORK_DIRECTORY=/opencv-build -ffile-prefix-map=$EMSDK_DIRECTORY=/emsdk"
  --cmake_option='-DCMAKE_CXX_STANDARD=17'
  --cmake_option='-DCMAKE_POLICY_VERSION_MINIMUM=3.5'
  --cmake_option='-DBUILD_opencv_3d=OFF'
  --cmake_option='-DBUILD_opencv_calib=OFF'
  --cmake_option='-DBUILD_opencv_dnn=OFF'
  --cmake_option='-DBUILD_opencv_stereo=OFF'
  --cmake_option='-DBUILD_opencv_video=OFF'
  --cmake_option='-DBUILD_opencv_ml=OFF'
  --cmake_option='-DBUILD_EXAMPLES=OFF'
  --cmake_option='-DBUILD_TESTS=OFF'
  --cmake_option='-DBUILD_PERF_TESTS=OFF'
)
emcmake python3 opencv/platforms/js/build_js.py build_js "${BUILD_OPTIONS[@]}" --config_only

# O getBuildInformation() embute host, hora e o caminho de cada ferramenta: trocado por uma linha
# fixa, o artefato não depende de onde nem de quando foi compilado.
BUILD_INFORMATION_FILE="build_js/modules/core/version_string.inc"
[[ -f "$BUILD_INFORMATION_FILE" ]] || { echo "OPENCV_BUILD_INFORMATION_NOT_FOUND" >&2; exit 1; }
printf '%s\n' '"\n"' "\"General configuration for OpenCV $OPENCV_TAG (TransportAdA, ADR-0065, deploy/opencv-build)\\n\"" \
  > "$BUILD_INFORMATION_FILE"

emcmake python3 opencv/platforms/js/build_js.py build_js "${BUILD_OPTIONS[@]}" --skip_config

# O wrapper UMD do OpenCV usa `this` no topo e `Module = {}` implícito: num worker ESM, `this` é
# `undefined` e o modo estrito recusa a atribuição. Mesmo ajuste que o @techstark/opencv-js aplica.
python3 - build_js/bin/opencv.js "$OUTPUT_FILE" "$WORK_DIRECTORY" <<'PATCH'
import re
import sys

source, target, work_directory = sys.argv[1], sys.argv[2], sys.argv[3]
content = open(source, encoding='utf-8').read()
replacements = [
    ('}(this, function () {', '}(globalThis, function () {'),
    ("if (typeof Module === 'undefined')\n    Module = {};", "if (typeof Module === 'undefined')\n    var Module = {};"),
]
for old, new in replacements:
    if content.count(old) != 1:
        sys.exit(f'OPENCV_BUILD_PATCH_NOT_FOUND: {old!r}')
    content = content.replace(old, new)
if re.search(r'(?<![A-Za-z0-9_$.])(new\s+)?Function\s*\(|(?<![A-Za-z0-9_$.])eval\s*\(', content):
    sys.exit('OPENCV_BUILD_DYNAMIC_EXECUTION_FOUND')
if work_directory in content:
    sys.exit('OPENCV_BUILD_HOST_PATH_FOUND')
open(target, 'w', encoding='utf-8').write(content)
PATCH

# Apache-2.0 §4: a licença, o aviso de copyright, o que foi modificado e as licenças de terceiros
# compilados junto vão ao lado do artefato.
rm -rf "$WORK_DIRECTORY/licenses" "$OUTPUT_DIRECTORY/third-party-licenses"
cmake --install build_js --component licenses --prefix "$WORK_DIRECTORY/licenses" >/dev/null
mkdir -p "$OUTPUT_DIRECTORY/third-party-licenses"
cp "$WORK_DIRECTORY"/licenses/share/licenses/opencv*/* "$OUTPUT_DIRECTORY/third-party-licenses/"
cp "$EMSDK_DIRECTORY/upstream/emscripten/LICENSE" "$OUTPUT_DIRECTORY/third-party-licenses/emscripten-LICENSE"
cp opencv/LICENSE opencv/COPYRIGHT "$OUTPUT_DIRECTORY/"
cp "$SCRIPT_DIRECTORY/NOTICE" "$OUTPUT_DIRECTORY/NOTICE"

shasum -a 256 "$OUTPUT_FILE" 2>/dev/null || sha256sum "$OUTPUT_FILE"
