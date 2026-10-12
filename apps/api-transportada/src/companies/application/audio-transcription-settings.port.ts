/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type AudioTranscriptionSettings = {
  readonly enabled: boolean
  /** Nulo enquanto nenhuma pessoa decidiu: a linha criada pela rotina não conta. */
  readonly updatedAt: Date | null
}

export type AudioTranscriptionActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

/**
 * Todo método recebe a empresa do contexto. `save` só escreve e audita quando o valor muda, e a linha de
 * `audit_logs` vai na mesma transação da escrita.
 */
export type AudioTranscriptionSettingsPort = {
  find(input: { readonly companyId: string }): Promise<AudioTranscriptionSettings>
  save(
    input: AudioTranscriptionActor & { readonly enabled: boolean },
  ): Promise<AudioTranscriptionSettings>
}
