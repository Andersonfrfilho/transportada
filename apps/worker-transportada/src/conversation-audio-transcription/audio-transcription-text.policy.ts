/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS } from '../shared/conversation-audio-transcription.constant.js'

const NUL_CHARACTER = '\u0000'
const WHITESPACE_CHARACTER = /\s/u

/**
 * O `text` do Postgres recusa U+0000, e o CHECK conta code points (`char_length`): o corte é por
 * `Array.from`, em fronteira de palavra quando houver uma (contract.md §5.5/§5.6).
 */
export function normalizeTranscriptionText(rawText: string): string {
  const text = rawText.replaceAll(NUL_CHARACTER, '')
  const characters = Array.from(text)
  if (characters.length <= AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS) return text

  const head = characters.slice(0, AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS)
  const lastWhitespace = head.findLastIndex((character) => WHITESPACE_CHARACTER.test(character))
  const end = lastWhitespace > 0 ? lastWhitespace : head.length
  return head.slice(0, end).join('').trimEnd()
}

const MODEL_NAME_MAX_LENGTH = 64
const MODEL_FILE_PREFIX = /^ggml-/u
const MODEL_FILE_EXTENSION = /\.[^./]+$/u

/** `.../ggml-small-q5_1.bin` → `small-q5_1` (a coluna `model` é varchar(64)). */
export function resolveModelName(modelPath: string): string {
  const fileName = modelPath.split('/').pop() ?? modelPath
  const name = fileName.replace(MODEL_FILE_EXTENSION, '').replace(MODEL_FILE_PREFIX, '')
  return name.slice(0, MODEL_NAME_MAX_LENGTH)
}
