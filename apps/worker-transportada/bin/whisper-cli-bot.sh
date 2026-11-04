#!/bin/sh
# Copyright (c) 2026 Ada Technology. MIT License.
#
# Spec 292 T9: o whisper-cli do áudio do bot do WhatsApp, com o texto de contexto
# (BOT_AUDIO_TRANSCRIPTION_PROMPT) que ensina ao modelo a grafia da marca e da frase de chamada.
# O pacote de transcrição ainda não aceita prompt; este invólucro é provisório até ele aceitar.
# O pacote passa `--max-context 0` (evita o laço de repetição em áudio longo), e com 0 o whisper.cpp
# descarta o prompt: aqui o contexto volta a 96 tokens e o prompt se repete em cada janela de 30 s
# (`--carry-initial-prompt`, whisper.cpp v1.9.4). Só para áudio curto (até 60 s).
set -eu
real="${AUDIO_TRANSCRIPTION_BINARY_PATH:-whisper-cli}"
if [ -z "${BOT_AUDIO_TRANSCRIPTION_PROMPT:-}" ]; then
  exec "$real" "$@"
fi
exec "$real" "$@" --max-context 96 --carry-initial-prompt --prompt "$BOT_AUDIO_TRANSCRIPTION_PROMPT"
