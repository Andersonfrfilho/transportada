# syntax=docker/dockerfile:1
# Contexto de build é a raiz do monorepo: os workspaces Bun exigem o package.json de todas as apps.
FROM oven/bun:1.3.14-alpine AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api-transportada/package.json apps/api-transportada/package.json
COPY apps/cron-transportada/package.json apps/cron-transportada/package.json
COPY apps/frontend-client/package.json apps/frontend-client/package.json
COPY apps/frontend-driver/package.json apps/frontend-driver/package.json
COPY apps/frontend-landing/package.json apps/frontend-landing/package.json
COPY apps/frontend-transportada/package.json apps/frontend-transportada/package.json
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json

FROM manifests AS build
RUN bun install --frozen-lockfile
COPY apps/worker-transportada apps/worker-transportada
RUN bun run --cwd apps/worker-transportada build

FROM manifests AS production-dependencies
RUN bun install --frozen-lockfile --production

# ADR-0103: o motor de transcrição é do worker. Compilador e ferramentas ficam só neste estágio.
FROM oven/bun:1.3.14-alpine AS whisper-build
ARG WHISPER_TAG=v1.9.4
ARG WHISPER_COMMIT=927cfce34f31707e17f2bff35c349632fb9e2c3a
RUN apk add --no-cache build-base cmake git
RUN git clone --depth 1 --branch "$WHISPER_TAG" https://github.com/ggml-org/whisper.cpp /src \
  && test "$(git -C /src rev-parse HEAD)" = "$WHISPER_COMMIT"
# NATIVE=OFF: o builder do Railway não é a máquina que roda, e NATIVE compilaria para a CPU do builder.
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
    -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON \
  && cmake --build /build --target whisper-cli -j"$(nproc)" \
  && install -m 0755 /build/bin/whisper-cli /usr/local/bin/whisper-cli

FROM alpine:3.22 AS models
RUN apk add --no-cache curl
WORKDIR /models
RUN curl -sSfL -o ggml-small-q5_1.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin \
  && echo "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb  ggml-small-q5_1.bin" | sha256sum -c -

# Spec 294 T4.8 (ADR 0113 §5): PP-OCRv4 detecção + reconhecimento (Apache-2.0, ~15 MB), lidos do disco pela thread do OCR do canhoto.
FROM alpine:3.22 AS canhoto-ocr-models
RUN apk add --no-cache curl
WORKDIR /models
RUN curl -sSfL -o ch_PP-OCRv4_det_infer.onnx https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx \
  && curl -sSfL -o ch_PP-OCRv4_rec_infer.onnx https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx \
  && curl -sSfL -o ppocr_keys_v1.txt https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/v2.7.1/ppocr/utils/ppocr_keys_v1.txt \
  && printf '%s\n' \
    "d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9  ch_PP-OCRv4_det_infer.onnx" \
    "48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b  ch_PP-OCRv4_rec_infer.onnx" \
    "28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7  ppocr_keys_v1.txt" | sha256sum -c -

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
# O caminho do modelo é fato da imagem; o resto da configuração da transcrição mora no `.railway/railway.ts`.
ENV NODE_ENV=production \
  AUDIO_TRANSCRIPTION_MODEL_PATH=/models/ggml-small-q5_1.bin \
  CANHOTO_OCR_MODEL_DIR=/models/canhoto-ocr
# ffmpeg traz o ffprobe; libstdc++ e libgomp são o que o whisper-cli compilado em musl pede.
RUN apk add --no-cache ffmpeg libstdc++ libgomp \
  && addgroup --system --gid 1001 transportada \
  && adduser --system --uid 1001 --ingroup transportada transportada

# O Bun instala por workspace: as dependências da app ficam no node_modules dela, não na raiz.
COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=production-dependencies /app/apps/worker-transportada/node_modules apps/worker-transportada/node_modules
COPY --from=build /app/apps/worker-transportada/dist apps/worker-transportada/dist
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json
COPY --from=whisper-build /usr/local/bin/whisper-cli /usr/local/bin/whisper-cli
# Spec 292 T9: o whisper-cli do áudio do bot com o texto de contexto (BOT_AUDIO_TRANSCRIPTION_PROMPT).
COPY apps/worker-transportada/bin/whisper-cli-bot.sh /usr/local/bin/whisper-cli-bot
RUN chmod 0755 /usr/local/bin/whisper-cli-bot
COPY --from=models /models/ggml-small-q5_1.bin /models/ggml-small-q5_1.bin
COPY --from=canhoto-ocr-models /models /models/canhoto-ocr

USER transportada
WORKDIR /app/apps/worker-transportada
# O worker fecha canais e conexão no SIGTERM; o processo precisa ser PID 1 para receber o sinal.
CMD ["bun", "./dist/main.js"]
