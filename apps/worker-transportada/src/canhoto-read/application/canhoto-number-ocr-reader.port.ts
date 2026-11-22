/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CanhotoIdentity } from '../domain/canhoto-identity.types.js'

/**
 * Spec 344 D2/D3: o que a passada OCR devolve — só o Nº/Série ancorados, nunca o texto lido (ADR-0113 §5.3).
 *
 * - `read` com `identity: null`: a leitura terminou sem Nº ancorado (carimba a tentativa).
 * - `unreadable`: a foto não abre (arquivo corrompido, acima do teto de pixels) — é desta foto, repetir não muda
 *   nada (carimba também). Falha do motor, prazo e fila cheia **não** voltam aqui: rejeitam com `CanhotoOcrError`.
 */
export type CanhotoNumberOcrResult =
  | Readonly<{ identity: CanhotoIdentity | null; kind: 'read' }>
  | Readonly<{ kind: 'unreadable' }>

export type ReadCanhotoNumberParams = Readonly<{
  bytes: Uint8Array
  /** A mesma chave de fila do leitor do bot (uma foto por chave): a rotina ocupa no máximo um lugar. */
  queueKey: string
}>

export type CanhotoNumberOcrReaderPort = Readonly<{
  /** Rejeita com `CanhotoOcrError` (`busy`, `timeout`, `engine_failed`). */
  readIdentity: (params: ReadCanhotoNumberParams) => Promise<CanhotoNumberOcrResult>
}>
