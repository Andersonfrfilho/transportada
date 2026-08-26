/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFiscalReadinessSnapshot } from '../../trips/application/read-trip-fiscal-readiness.use-case.js'
import { shouldIssueAutomatically } from '../../trips/domain/trip-manifest.policy.js'
import type { MdfeManifestCompanyContext } from './mdfe-manifest.port.js'
import type { CreateTripMdfeManifestUseCase } from './create-trip-mdfe-manifest.use-case.js'

/**
 * Spec 065 D2b: **o MDF-e se emite sozinho assim que passa a ser possível.** Quem chama isto é o
 * consumer que escuta a autorização de CT-e — uma máquina, e é isso que muda o desenho da resposta.
 *
 * **Esta operação não recusa: ela relata.** Um `409` devolvido a um consumer vira reentrega, e
 * reentrega de uma recusa definitiva ("a viagem ainda não saiu") é uma fila que nunca drena e um
 * alerta que ninguém mais lê. Toda razão de não emitir volta como `outcome`, com `HTTP 200`.
 *
 * O que **continua subindo como erro** é o imprevisto — banco fora, provedor fora. Esse merece a
 * reentrega que o trilho dá, e engoli-lo aqui esconderia falha real atrás de "não deu".
 */
export const AUTOMATIC_MANIFEST_OUTCOMES = [
  'issued',
  /** A empresa não optou pela emissão automática. */
  'automatic_disabled',
  /** A carga ainda não saiu, falta CT-e, ou não há o que manifestar. */
  'not_eligible',
  /** Já existe manifesto vivo — inclusive quando dois eventos chegam juntos. */
  'already_manifested',
  /** A emissão recusou por regra de negócio: UF de descarga ambígua, certificado, 50 municípios. */
  'refused',
] as const
export type AutomaticManifestOutcome = (typeof AUTOMATIC_MANIFEST_OUTCOMES)[number]

export type AutomaticManifestResult = {
  /** Código estável da recusa, quando houve — é o que a notificação e a tela traduzem. */
  readonly refusalCode: string | null
  readonly manifestId: string | null
  readonly outcome: AutomaticManifestOutcome
}

export type AutomaticManifestTripPort = {
  /** `null` quando a viagem não existe nesta empresa. */
  findStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null>
  isAutomaticEnabled(input: { readonly companyId: string }): Promise<boolean>
  readReadiness(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripFiscalReadinessSnapshot>
}

export type IssueTripManifestAutomaticallyInput = {
  readonly context: MdfeManifestCompanyContext
  readonly correlationId: string
  readonly createManifest: CreateTripMdfeManifestUseCase
  readonly repository: AutomaticManifestTripPort
  readonly tripId: string
}

/** Toda a defesa contra emissão duplicada é do banco (unique de manifesto vivo), nunca deste `if`. */
export async function issueTripManifestAutomatically(
  input: IssueTripManifestAutomaticallyInput,
): Promise<AutomaticManifestResult> {
  const companyId = input.context.companyId
  const tripStatus = await input.repository.findStatus({ companyId, tripId: input.tripId })
  if (tripStatus === null) return refuse('not_eligible', 'TRIP_NOT_FOUND')

  if (!(await input.repository.isAutomaticEnabled({ companyId }))) {
    return refuse('automatic_disabled', null)
  }

  const readiness = await input.repository.readReadiness({ companyId, tripId: input.tripId })
  if (readiness.state === 'manifested' || readiness.state === 'divergent') {
    return refuse('already_manifested', null)
  }
  if (!shouldIssueAutomatically({ isAutomaticEnabled: true, readiness, tripStatus })) {
    return refuse('not_eligible', null)
  }

  try {
    const manifest = await input.createManifest.execute({
      context: input.context,
      correlationId: input.correlationId,
      manifest: EMPTY_MANIFEST_FIELDS,
      tripId: input.tripId,
    })

    return { manifestId: manifest.id, outcome: 'issued', refusalCode: null }
  } catch (error) {
    /**
     * Recusa de negócio é definitiva: reenviar produz a mesma recusa para sempre. O imprevisto sobe,
     * porque é ele que a reentrega conserta.
     */
    if (error instanceof ApiError && error.status < 500) return refuse('refused', error.code)
    throw error
  }
}

/**
 * O manifesto automático nasce **só** do que a viagem sabe: veículo, condutores, CT-e e municípios. O
 * resto do formulário tem padrão no schema, e o que não tiver padrão recusa com código estável — que
 * é a resposta certa, porque ninguém está na frente da tela para preencher.
 */
const EMPTY_MANIFEST_FIELDS = {
  additionalInformation: '',
  cargoProduct: '',
  cargoProductNcm: '',
  cargoType: '' as const,
  cargoUnit: '01' as const,
  contractorName: '',
  contractorTaxId: '',
  destinationState: '',
  dischargePostalCode: '',
  emitterType: '1' as const,
  freightValue: '0.00',
  insuranceEndorsement: '',
  loadingPostalCode: '',
  transporterType: '' as const,
  tripStartedAt: null,
}

function refuse(
  outcome: AutomaticManifestOutcome,
  refusalCode: string | null,
): AutomaticManifestResult {
  return { manifestId: null, outcome, refusalCode }
}
