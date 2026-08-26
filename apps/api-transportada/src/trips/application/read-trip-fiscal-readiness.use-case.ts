/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FiscalDocumentKind } from '../domain/fiscal-document-kind.policy.js'
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
  /**
   * Spec 065 D4: entrega no município da transportadora. Ela vira **NFS-e**, nunca terá CT-e, e
   * **não entra no manifesto nem o bloqueia** — travar a saída do caminhão por uma nota de serviço
   * municipal é travar por documento que não vai dentro dele.
   */
  'nfse_expected',
  /** Sem município de destino não dá para decidir o documento. Pendência explícita, nunca um chute. */
  'city_unknown',
] as const
export type TripDocumentReadinessReason = (typeof TRIP_DOCUMENT_READINESS_REASONS)[number]

export type TripDocumentReadiness = {
  readonly cteAccessKey: string | null
  /** O id do CT-e autorizado — é ele que o manifesto declara, e é por isso que ele sobe daqui. */
  readonly cteFiscalDocumentId: string | null
  /** O documento que esta nota espera. `null` quando não deu para decidir (`city_unknown`). */
  readonly expectedDocument: FiscalDocumentKind | null
  readonly reason: TripDocumentReadinessReason
  readonly rejectionCode: string | null
  readonly rejectionMessage: string | null
  readonly tripDocumentId: string
}

export type TripFiscalReadinessSnapshot = {
  readonly documents: readonly TripDocumentReadiness[]
  /** Quantas notas esperam **CT-e** — é o denominador que importa, e o que a tela mostra. */
  readonly manifestableCount: number
  /** Notas de entrega urbana: receita e obrigação, mas fora do manifesto. */
  readonly nfseCount: number
  readonly readyCount: number
  /**
   * `manifested` e `divergent` dependem do manifesto, não só das notas: viagem com manifesto vivo e
   * um CT-e cancelado depois dele é **divergente**, e é o caso que a P2 da spec nomeia.
   */
  readonly state: 'divergent' | 'incomplete' | 'manifested' | 'not_applicable' | 'ready'
  readonly totalCount: number
}

export type TripFiscalReadinessPort = {
  /**
   * Municípios distintos das paradas da viagem (spec 056). O layout do MDF-e limita a 50, e a
   * contagem vem da **viagem** porque é ela que sabe onde vai descarregar — o manifesto ainda não
   * existe quando a recusa precisa acontecer.
   */
  countDischargeCities(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<number>
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
 * Spec 065 D4: **só a nota que espera CT-e conta para o manifesto.** A de entrega urbana vira NFS-e e
 * nunca vai autorizar um CT-e — esperar por ela é esperar para sempre, e numa carga mista (que é a
 * carga de todo dia) isso travaria a viagem inteira.
 *
 * Uma viagem **sem nenhuma nota de CT-e** não é "incompleta": ela é `not_applicable`, e não tem
 * manifesto a emitir. Ficar incompleta para sempre é como uma viagem some da lista sem ninguém
 * entender.
 */
export async function readTripFiscalReadiness(
  input: ReadTripFiscalReadinessInput,
): Promise<TripFiscalReadinessSnapshot> {
  const documents = await input.repository.readDocumentReadiness(input)
  if (documents === null) throw new TripNotFoundError()

  const manifestable = documents.filter((document) => document.expectedDocument === 'cte')
  const readyCount = manifestable.filter((document) => document.reason === 'ok').length
  /** Sem município não se decide o documento, e uma nota indecisa **bloqueia** — ela pode ser CT-e. */
  const hasUndecided = documents.some((document) => document.reason === 'city_unknown')
  const isComplete = manifestable.length > 0 && readyCount === manifestable.length && !hasUndecided
  const hasLiveManifest = await input.repository.hasLiveManifest(input)

  return {
    documents,
    manifestableCount: manifestable.length,
    nfseCount: documents.filter((document) => document.expectedDocument === 'nfse').length,
    readyCount,
    state: resolveState({
      hasLiveManifest,
      hasManifestableDocuments: manifestable.length > 0 || hasUndecided,
      isComplete,
    }),
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
  readonly hasManifestableDocuments: boolean
  readonly isComplete: boolean
}): TripFiscalReadinessSnapshot['state'] {
  if (input.hasLiveManifest) return input.isComplete ? 'manifested' : 'divergent'
  /**
   * Viagem só de entrega urbana — ou sem nota nenhuma. Não há o que manifestar, e dizer isso é
   * diferente de dizer "falta alguma coisa": o botão de emitir não deve nem aparecer.
   */
  if (!input.hasManifestableDocuments) return 'not_applicable'

  return input.isComplete ? 'ready' : 'incomplete'
}
