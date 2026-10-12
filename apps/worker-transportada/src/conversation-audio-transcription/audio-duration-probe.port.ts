/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type AudioDurationProbeParams = {
  readonly audio: Buffer
  readonly maxDurationMilliseconds: number
}

/**
 * Duração em ms. Sem duração no cabeçalho a medida é por decodificação com teto, e então o valor
 * não passa de `teto + 1 s` — o bastante para comparar com o teto. Falha sai como `SpeechToTextError`.
 */
export type AudioDurationProbe = {
  measure(params: AudioDurationProbeParams): Promise<number>
}
