/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0063 §3: a resposta da contratante só decide a taxa com DKIM válido e **alinhado** ao
 * domínio do `From`. A `mailauth` já resolve o alinhamento relaxado (domínio organizacional, via
 * `tldts`) e devolve o veredito em `status.aligned` — não reimplementamos a PSL aqui, só lemos o
 * que ela já decidiu.
 *
 * `status.result` segue o vocabulário do RFC 8601 (`pass`, `fail`, `neutral`, `none`,
 * `temperror`, `permerror`, `policy`, `softfail`, `skipped`). `temperror` é a única falha
 * **transitória** (timeout de DNS, resolvedor fora do ar) — é ela que vira `unverifiable`; o
 * resto (assinatura presente mas inválida, corpo adulterado, `d=` de outro domínio, chave ausente)
 * é `not_aligned`, porque a mailauth já tentou e concluiu que não serve para decidir.
 */

export type DkimSignatureStatus = {
  readonly result: string
  readonly aligned?: string | false
}

export type DkimSignatureVerification = {
  readonly status: DkimSignatureStatus
}

export const DKIM_ALIGNMENT_RESULT = {
  ALIGNED: 'aligned',
  NOT_ALIGNED: 'not_aligned',
  UNVERIFIABLE: 'unverifiable',
  ABSENT: 'absent',
} as const

export type DkimAlignmentResult = (typeof DKIM_ALIGNMENT_RESULT)[keyof typeof DKIM_ALIGNMENT_RESULT]

const TRANSIENT_FAILURE_RESULTS = new Set(['temperror', 'temperr'])

function isAlignedPass(signature: DkimSignatureVerification): boolean {
  return signature.status.result === 'pass' && Boolean(signature.status.aligned)
}

function isTransientFailure(signature: DkimSignatureVerification): boolean {
  return TRANSIENT_FAILURE_RESULTS.has(signature.status.result)
}

function isAbsent(signature: DkimSignatureVerification): boolean {
  return signature.status.result === 'none'
}

/**
 * Decide o alinhamento de DKIM a partir dos resultados de `dkimVerify` (um por assinatura no
 * MIME). Mensagem com mais de uma assinatura decide pela melhor: uma alinhada basta.
 */
export function resolveDkimAlignment(
  signatures: readonly DkimSignatureVerification[],
): DkimAlignmentResult {
  if (signatures.length === 0 || signatures.every(isAbsent)) return DKIM_ALIGNMENT_RESULT.ABSENT

  if (signatures.some(isAlignedPass)) return DKIM_ALIGNMENT_RESULT.ALIGNED

  // Basta uma assinatura ainda sem veredito (DNS fora do ar) para o resultado ser "não deu para
  // verificar", nunca "verificado e não alinhado" — ela poderia ter sido a decisiva.
  if (signatures.some(isTransientFailure)) return DKIM_ALIGNMENT_RESULT.UNVERIFIABLE

  return DKIM_ALIGNMENT_RESULT.NOT_ALIGNED
}
