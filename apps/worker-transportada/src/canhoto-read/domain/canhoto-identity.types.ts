/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 344 D3 / RF1: o que o canhoto diz de si mesmo — número e série **impressos**, ancorados pelo rótulo.
 * Só dígitos, sem zeros à esquerda: o texto reconhecido nunca sai daqui (ADR-0113 §5.3).
 */
export type CanhotoIdentity = Readonly<{
  number: string
  /** Série só vem com número (a CHECK de `canhoto_read_series` pede número); `null` = série não lida. */
  series: string | null
}>
