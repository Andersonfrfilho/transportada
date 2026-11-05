/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8: o reconhecimento do canhoto pelo OCR local do worker. Mesma regra do worker (`CANHOTO_OCR_ENABLED`):
 * ligado fora de produção, desligado em produção até o dono ligar com `true` (pico de ~740 MB por leitura no worker).
 */
export function isCanhotoOcrEnabled(environment: Record<string, string | undefined>): boolean {
  const declared = environment.CANHOTO_OCR_ENABLED?.trim() ?? ''
  if (declared === 'true') return true
  if (declared === 'false') return false
  return environment.APP_ENV !== 'production'
}
