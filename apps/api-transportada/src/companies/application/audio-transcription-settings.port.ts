/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type AudioTranscriptionStoredSettings = {
  readonly enabled: boolean
  /** Nulo enquanto nenhuma pessoa mudou a configuração. */
  readonly updatedAt: Date | null
}

export type AudioTranscriptionSettings = AudioTranscriptionStoredSettings & {
  readonly maxDurationMs: number
}

export type AudioTranscriptionActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

export type SaveAudioTranscriptionSettingsParams = AudioTranscriptionActor & {
  readonly enabled: boolean
}

/** `save` grava a auditoria na mesma transação, e só quando o valor muda. */
export type AudioTranscriptionSettingsPort = {
  find(params: { readonly companyId: string }): Promise<AudioTranscriptionStoredSettings>
  save(params: SaveAudioTranscriptionSettingsParams): Promise<AudioTranscriptionStoredSettings>
}
