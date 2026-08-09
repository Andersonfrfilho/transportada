# syntax=docker/dockerfile:1
# Copyright (c) 2026 Ada Technology. MIT License.
#
# Mesma escolha do `deploy/vector`: a configuração viaja dentro da imagem, não num volume nem num
# painel. Quem monitora o quê é diff no pull request, e uma instalação nova sobe já vigiada.
FROM ghcr.io/twin/gatus:v5.36.0@sha256:c5f210d095fa78e6efaa20ffeb14803f2ba4f10615e16a6d12087697149617f0

COPY deploy/gatus/config.yaml /config/config.yaml
