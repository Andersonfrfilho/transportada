/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { existsSync } from 'node:fs'

import type { AudioTranscriptionEnvironment } from '../shared/worker.types.js'
import {
  DEFAULT_FFMPEG_BINARY,
  DEFAULT_FFPROBE_BINARY,
} from './audio-transcription-engine.constant.js'

export const AUDIO_TRANSCRIPTION_TOOL = {
  FFMPEG: 'ffmpeg',
  FFPROBE: 'ffprobe',
  MODEL: 'model',
  WHISPER_BINARY: 'whisper_binary',
} as const
export type AudioTranscriptionTool =
  (typeof AUDIO_TRANSCRIPTION_TOOL)[keyof typeof AUDIO_TRANSCRIPTION_TOOL]

export type AudioTranscriptionToolingProbe = {
  which(binary: string): string | null
  exists(path: string): boolean
}

export type CheckAudioTranscriptionToolingParams = {
  readonly environment: AudioTranscriptionEnvironment
  readonly probe?: AudioTranscriptionToolingProbe
}

const DEFAULT_PROBE: AudioTranscriptionToolingProbe = {
  exists: existsSync,
  which: (binary) => Bun.which(binary),
}

/**
 * Com o modelo configurado mas uma ferramenta ausente, todo áudio da janela falharia sem que ninguém visse.
 * Devolve só os NOMES do que falta (nunca caminho de arquivo nem segredo): quem chama não registra a rotina.
 */
export function checkAudioTranscriptionTooling(
  params: CheckAudioTranscriptionToolingParams,
): readonly AudioTranscriptionTool[] {
  const { environment } = params
  const probe = params.probe ?? DEFAULT_PROBE
  const missing: AudioTranscriptionTool[] = []
  if (probe.which(environment.binaryPath) === null)
    missing.push(AUDIO_TRANSCRIPTION_TOOL.WHISPER_BINARY)
  if (probe.which(DEFAULT_FFPROBE_BINARY) === null) missing.push(AUDIO_TRANSCRIPTION_TOOL.FFPROBE)
  if (probe.which(DEFAULT_FFMPEG_BINARY) === null) missing.push(AUDIO_TRANSCRIPTION_TOOL.FFMPEG)
  if (!probe.exists(environment.modelPath)) missing.push(AUDIO_TRANSCRIPTION_TOOL.MODEL)
  return missing
}
