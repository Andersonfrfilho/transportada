# Copyright (c) 2026 Ada Technology. MIT License.
#
# O MinIO do ambiente local e da CI, compilado do código-fonte.
#
# A MinIO parou de publicar imagem da edição comunitária em 2025-10 e, em 2026-09, tirou as antigas do
# Docker Hub (dia 11) e do quay.io (dia 24) — e os binários assinados de dl.min.io respondem 410. O
# código continua público: esta imagem compila a mesma versão que o compose usava
# (`RELEASE.2025-09-07T16-13-09Z`), com o `mc` que o `make storage-bootstrap` chama dentro do
# container. Produção não usa MinIO — é o S3 de mentira do dev e da CI.
#
# Publicar (multiplataforma, a CI roda em amd64):
#   docker buildx build --platform linux/amd64,linux/arm64 \
#     -t ghcr.io/andersonfrfilho/minio:RELEASE.2025-09-07T16-13-09Z --push infra/minio

# O estágio de compilação roda na arquitetura de quem compila e cruza para a de destino pelo próprio
# Go — sem emulação QEMU, que levaria dezenas de minutos para um binário deste tamanho.
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build

ARG MINIO_REF=RELEASE.2025-09-07T16-13-09Z
ARG MC_REF=RELEASE.2025-08-13T08-35-41Z
ARG TARGETOS
ARG TARGETARCH

RUN apk add --no-cache git
ENV CGO_ENABLED=0 GOFLAGS=-trimpath

RUN git clone --depth 1 --branch "$MINIO_REF" https://github.com/minio/minio /src/minio
WORKDIR /src/minio
RUN GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -ldflags "-s -w" -o /out/minio .

RUN git clone --depth 1 --branch "$MC_REF" https://github.com/minio/mc /src/mc
WORKDIR /src/mc
RUN GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -ldflags "-s -w" -o /out/mc .

FROM alpine:3.20

# `curl` para o healthcheck do compose; `sh` (do alpine) para o `mc` do storage-bootstrap.
RUN apk add --no-cache ca-certificates curl
COPY --from=build /out/minio /out/mc /usr/bin/

# Liga o pacote do GHCR ao repositório: é o que deixa o GITHUB_TOKEN da CI baixá-lo sendo privado.
LABEL org.opencontainers.image.source=https://github.com/Andersonfrfilho/transportada \
      org.opencontainers.image.description="MinIO RELEASE.2025-09-07T16-13-09Z compilado do código-fonte, para dev e CI" \
      org.opencontainers.image.licenses=AGPL-3.0

EXPOSE 9000 9001
ENTRYPOINT ["minio"]
