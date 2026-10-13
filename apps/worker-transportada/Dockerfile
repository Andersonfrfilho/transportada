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

# Transcrição de áudio (ADR-0103, spec 264): whisper-cli de tag fixada e modelo conferido por sha256.
# Estágio próprio, na mesma base Alpine do runtime: as ferramentas de build não chegam à imagem final.
FROM oven/bun:1.3.14-alpine AS whisper
ARG WHISPER_TAG=v1.9.4
ARG WHISPER_COMMIT=927cfce34f31707e17f2bff35c349632fb9e2c3a
ARG WHISPER_MODEL=ggml-small-q5_1.bin
ARG WHISPER_MODEL_SHA256=ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb
RUN apk add --no-cache build-base cmake git curl
# A tag pode mover; o commit conferido é o que de fato entra. NATIVE=OFF: o builder não é a CPU que roda.
RUN git clone --depth 1 --branch "$WHISPER_TAG" https://github.com/ggml-org/whisper.cpp.git /whisper.cpp \
  && test "$(git -C /whisper.cpp rev-parse HEAD)" = "$WHISPER_COMMIT" \
  && cmake -S /whisper.cpp -B /whisper.cpp/build \
    -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
    -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON \
  && cmake --build /whisper.cpp/build --config Release --target whisper-cli -j "$(nproc)" \
  && install -D /whisper.cpp/build/bin/whisper-cli /out/whisper-cli
RUN mkdir -p /models \
  && curl -fsSL --retry 3 -o "/models/$WHISPER_MODEL" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL" \
  && echo "$WHISPER_MODEL_SHA256  /models/$WHISPER_MODEL" | sha256sum -c -

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 transportada \
  && adduser --system --uid 1001 --ingroup transportada transportada

# ffmpeg traz o ffprobe; libgomp e libstdc++ são o que o whisper-cli enlaça dinamicamente.
RUN apk add --no-cache ffmpeg libgomp libstdc++
COPY --from=whisper /out/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper --chown=transportada:transportada /models /models

# O Bun instala por workspace: as dependências da app ficam no node_modules dela, não na raiz.
COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=production-dependencies /app/apps/worker-transportada/node_modules apps/worker-transportada/node_modules
COPY --from=build /app/apps/worker-transportada/dist apps/worker-transportada/dist
COPY apps/worker-transportada/package.json apps/worker-transportada/package.json

USER transportada
WORKDIR /app/apps/worker-transportada
# O worker fecha canais e conexão no SIGTERM; o processo precisa ser PID 1 para receber o sinal.
CMD ["bun", "./dist/main.js"]
