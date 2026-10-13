/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type AudioObjectReadParams = {
  readonly bucket: string
  readonly key: string
  /** Desligamento do worker ou prazo do download. */
  readonly signal: AbortSignal
}

/**
 * `undefined` é "o objeto não existe" (fato do mundo, definitivo); erro de transporte LANÇA como
 * `SpeechToTextError` retriável — o leitor compartilhado das outras rotinas não faz essa distinção.
 */
export type AudioObjectReader = {
  read(params: AudioObjectReadParams): Promise<Uint8Array | undefined>
}
