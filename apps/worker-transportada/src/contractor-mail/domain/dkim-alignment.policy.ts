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
  /** O motivo que a `mailauth` dá quando não passa (`body hash did not verify`, `no key`…). */
  readonly comment?: string | false
}

export type DkimSignatureVerification = {
  /** A assinatura declarou `l=`: só parte do corpo está coberta (a `mailauth` marca em cada resultado). */
  readonly canonBodyLengthLimited?: boolean
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

/**
 * Spec 237 T4.7a: assinatura com `l=` deixa o resto do corpo livre para quem encaminha ou acrescenta texto
 * depois do trecho assinado — o hash confere e o conteúdo não é o que o domínio assinou. Nunca alinha.
 */
function isAlignedPass(signature: DkimSignatureVerification): boolean {
  return (
    signature.status.result === 'pass' &&
    Boolean(signature.status.aligned) &&
    signature.canonBodyLengthLimited !== true
  )
}

/**
 * Spec 237 T4.7d: só a falha transitória de assinatura ALINHADA ao `From` vale como "sem veredito". A `mailauth`
 * calcula `status.aligned` antes de consultar o DNS: uma assinatura de domínio alheio com o DNS mudo nunca decidiria
 * nada, e repetir a entrega por ela mantinha o trilho refém de quem controla esse DNS.
 */
function isTransientFailure(signature: DkimSignatureVerification): boolean {
  return TRANSIENT_FAILURE_RESULTS.has(signature.status.result) && Boolean(signature.status.aligned)
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

  // Basta uma assinatura alinhada ainda sem veredito (DNS fora do ar) para o resultado ser "não deu para
  // verificar", nunca "verificado e não alinhado" — ela poderia ter sido a decisiva.
  if (signatures.some(isTransientFailure)) return DKIM_ALIGNMENT_RESULT.UNVERIFIABLE

  return DKIM_ALIGNMENT_RESULT.NOT_ALIGNED
}

/** Os motivos da `mailauth` que podem ir a log: vocabulário fixo, sem domínio nem endereço. */
const DKIM_DIAGNOSTIC_REASONS = new Set([
  'bad signature',
  'body hash did not verify',
  'expired',
  'invalid expiration',
  'invalid public key',
  'no key',
  'unknown key type',
  'unknown key version',
])
const DKIM_DIAGNOSTIC_MAX_SIGNATURES = 5

export type DkimSignatureDiagnostic = {
  readonly aligned: boolean
  readonly lengthLimited: boolean
  readonly reason: string | null
  readonly result: string
}

/**
 * Por que o DKIM não alinhou, num formato que pode ir a log: veredito, alinhamento e o motivo da `mailauth` só
 * quando é do vocabulário fixo (o resto vira `other`) — nunca domínio, seletor ou endereço.
 */
export function summarizeDkimSignatures(
  signatures: readonly DkimSignatureVerification[],
): readonly DkimSignatureDiagnostic[] {
  return signatures.slice(0, DKIM_DIAGNOSTIC_MAX_SIGNATURES).map((signature) => {
    const comment = signature.status.comment
    return {
      aligned: Boolean(signature.status.aligned),
      lengthLimited: signature.canonBodyLengthLimited === true,
      reason:
        typeof comment === 'string' && comment !== ''
          ? DKIM_DIAGNOSTIC_REASONS.has(comment)
            ? comment
            : 'other'
          : null,
      result: signature.status.result,
    }
  })
}
