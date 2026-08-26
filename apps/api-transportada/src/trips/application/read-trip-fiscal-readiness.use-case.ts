/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TripNotFoundError } from '../domain/trip.error.js'

/**
 * ADR-0046 §1: a prontidão responde **por nota**, nunca só sim ou não. "A viagem não está pronta" é
 * a resposta que manda o operador abrir outra tela; "a nota 1234 teve o CT-e rejeitado, cStat 539" é
 * a que ele resolve.
 */
export const TRIP_DOCUMENT_READINESS_REASONS = [
  'ok',
  /** Nenhum CT-e foi emitido para esta nota ainda. */
  'no_cte',
  /** Existe tentativa em andamento — em lote, em voo, ou aguardando retry. */
  'cte_in_progress',
  /** A SEFAZ recusou. O cStat e a mensagem vão junto, porque é o que decide o próximo passo. */
  'cte_rejected',
  /** Havia CT-e autorizado e ele foi cancelado. Manifestar sobre ele seria declarar o inexistente. */
  'cte_cancelled',
] as const
export type TripDocumentReadinessReason = (typeof TRIP_DOCUMENT_READINESS_REASONS)[number]

export type TripDocumentReadiness = {
  readonly cteAccessKey: string | null
  readonly reason: TripDocumentReadinessReason
  readonly rejectionCode: string | null
  readonly rejectionMessage: string | null
  readonly tripDocumentId: string
}

export type TripFiscalReadinessSnapshot = {
  readonly documents: readonly TripDocumentReadiness[]
  readonly readyCount: number
  /**
   * `manifested` e `divergent` dependem do manifesto, não só das notas: viagem com manifesto vivo e
   * um CT-e cancelado depois dele é **divergente**, e é o caso que a P2 da spec nomeia.
   */
  readonly state: 'divergent' | 'incomplete' | 'manifested' | 'ready'
  readonly totalCount: number
}

export type TripFiscalReadinessPort = {
  /** `null` quando a viagem não existe nesta empresa. */
  readDocumentReadiness(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripDocumentReadiness[] | null>
  hasLiveManifest(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean>
}

export type ReadTripFiscalReadinessInput = {
  readonly companyId: string
  readonly repository: TripFiscalReadinessPort
  readonly tripId: string
}

/**
 * Uma viagem **sem nota nenhuma** não é pronta: não existe manifesto vazio, e devolver `ready` aqui
 * faria o consumer emitir um MDF-e sem CT-e algum dentro.
 */
export async function readTripFiscalReadiness(
  input: ReadTripFiscalReadinessInput,
): Promise<TripFiscalReadinessSnapshot> {
  const documents = await input.repository.readDocumentReadiness(input)
  if (documents === null) throw new TripNotFoundError()

  const readyCount = documents.filter((document) => document.reason === 'ok').length
  const isComplete = documents.length > 0 && readyCount === documents.length
  const hasLiveManifest = await input.repository.hasLiveManifest(input)

  return {
    documents,
    readyCount,
    state: resolveState({ hasLiveManifest, isComplete }),
    totalCount: documents.length,
  }
}

/**
 * O manifesto vivo sobre notas que deixaram de estar prontas é **divergência**, e o sistema não
 * cancela nada sozinho: cancelamento de MDF-e é decisão fiscal humana, com janela e regra próprias
 * (ADR-0046). O que ele faz é não deixar a divergência passar despercebida.
 */
function resolveState(input: {
  readonly hasLiveManifest: boolean
  readonly isComplete: boolean
}): TripFiscalReadinessSnapshot['state'] {
  if (input.hasLiveManifest) return input.isComplete ? 'manifested' : 'divergent'

  return input.isComplete ? 'ready' : 'incomplete'
}
