/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteEmissionMatchRole,
  CteMunicipalServicePolicy,
  CteEmissionProfileMatchMode,
  CteEmissionProfileStatus,
} from '../../database/cte-emission-profile.schema.js'
import {
  CteEmissionProfileAmbiguousError,
  CteEmissionProfileCityNotCoveredError,
  CteEmissionProfileInactiveError,
  CteEmissionProfileInvalidTaxIdError,
  CteEmissionProfileNotFoundError,
  CteEmissionProfileUnresolvedError,
} from './cte-profile.error.js'
import { CNPJ_PATTERN } from '../../shared/tax-id.service.js'

const TAX_ID_ROOT_LENGTH = 14 - 6

/**
 * Spec 312: a chave com que a cidade de destino é comparada — maiúscula, sem acento, espaços
 * normalizados e a UF. O nome vem da nota (`xMun`) e da lista cadastrada à mão; só a forma
 * normalizada é confiável para comparar as duas.
 */
export function cityKey(city: string, state: string): string {
  const name = city
    .normalize('NFD')
    .replaceAll(/\p{Mn}/gu, '')
    .toUpperCase()
    .replaceAll(/\s+/gu, ' ')
    .trim()
  return `${name}|${state.trim().toUpperCase()}`
}

const PRECISION_RANK = { full: 0, root: 1 } as const
const ROLE_RANK = { recipient: 1, sender: 0 } as const

export type EmissionProfileMatcher = {
  readonly matchRole: CteEmissionMatchRole
  readonly taxId: string
}

export type EmissionProfileCandidate = {
  readonly id: string
  readonly matchMode: CteEmissionProfileMatchMode
  readonly matchers: readonly EmissionProfileMatcher[]
  readonly name: string
  readonly priority: bigint
  readonly status: CteEmissionProfileStatus
  /**
   * Spec 312: as cidades de destino (chave de `cityKey`) a que o perfil se restringe. Ausente ou nulo
   * é "qualquer cidade" — o caso de todo perfil anterior à 312. Lista vazia não casa nenhuma.
   */
  readonly destinationCities?: readonly string[] | null | undefined
}

export type EmissionProfileInvoiceParties = {
  /** Spec 312: `cityKey` da cidade do endereço do destinatário; ausente quando a nota não a traz. */
  readonly recipientCityKey?: string | null | undefined
  readonly recipientTaxId: string
  readonly senderTaxId: string
}

export type ResolveEmissionProfileParams = {
  readonly invoice: EmissionProfileInvoiceParties
  readonly profiles: readonly EmissionProfileCandidate[]
  readonly requestedProfileId?: string
}

export type EmissionProfileResolution = {
  readonly matchedBy: 'manual' | 'recipient_tax_id' | 'sender_tax_id'
  readonly matchedTaxId: string | null
  readonly precision: 'full' | 'none' | 'root'
  readonly profileId: string
}

type ProfileMatch = {
  readonly candidate: EmissionProfileCandidate
  readonly matchedTaxId: string
  readonly precision: 'full' | 'root'
  readonly role: CteEmissionMatchRole
}

export function resolveEmissionProfile({
  invoice,
  profiles,
  requestedProfileId,
}: ResolveEmissionProfileParams): EmissionProfileResolution {
  if (requestedProfileId !== undefined) {
    return resolveRequestedProfile(profiles, requestedProfileId)
  }

  const senderTaxId = assertFullTaxId(invoice.senderTaxId)
  const recipientTaxId = assertFullTaxId(invoice.recipientTaxId)
  const recipientCityKey = invoice.recipientCityKey
  const active = profiles.filter(
    (candidate) => candidate.matchMode === 'sender_tax_id' && candidate.status === 'active',
  )
  const matches = active
    .flatMap((candidate) =>
      matchCandidate({ candidate, recipientCityKey, recipientTaxId, senderTaxId }),
    )
    .toSorted(compareMatches)

  const [best, runnerUp] = matches
  if (best === undefined) {
    const coveredByTaxId = active.some(
      (candidate) =>
        matchCandidate({
          candidate,
          recipientCityKey: undefined,
          recipientTaxId,
          senderTaxId,
          skipCity: true,
        }).length > 0,
    )
    throw coveredByTaxId
      ? new CteEmissionProfileCityNotCoveredError()
      : new CteEmissionProfileUnresolvedError()
  }
  if (runnerUp !== undefined && compareMatches(best, runnerUp) === 0) {
    throw new CteEmissionProfileAmbiguousError()
  }

  return {
    matchedBy: best.role === 'sender' ? 'sender_tax_id' : 'recipient_tax_id',
    matchedTaxId: best.matchedTaxId,
    precision: best.precision,
    profileId: best.candidate.id,
  }
}

/**
 * A mesma escolha de `resolveEmissionProfile`, **sem lançar**. A listagem de notas precisa saber
 * qual perfil rege cada linha para aplicar o que ele configura, e os três casos que a emissão trata
 * como erro — nota sem perfil, empate, documento fora do padrão — são casos normais numa tela que
 * mostra a base inteira. Ausência aqui significa "nenhum perfil rege esta nota", e quem consome
 * decide o que fazer com isso; hoje, não aplicar portão nenhum.
 */
export function findEmissionProfile(
  params: FindEmissionProfileParams,
): EmissionProfileResolution | null {
  return explainEmissionProfile(params).resolution ?? null
}

export type FindEmissionProfileParams = {
  readonly invoice: EmissionProfileInvoiceParties
  readonly profiles: readonly EmissionProfileCandidate[]
}

/** Por que nenhum perfil rege a nota: nenhum casa, dois empatam, ou um dos lados não tem CNPJ. */
export type EmissionProfileNoMatchReason =
  | 'ambiguous'
  | 'city_not_covered'
  | 'not_cnpj'
  | 'unmatched'

export type EmissionProfileExplanation =
  | { readonly reason?: undefined; readonly resolution: EmissionProfileResolution }
  | { readonly reason: EmissionProfileNoMatchReason; readonly resolution?: undefined }

/**
 * A escolha de `findEmissionProfile` com o **motivo** da ausência (spec 144 D3). O `null` junta
 * situações que o operador resolve de jeitos diferentes — cadastrar um perfil, desempatar a
 * prioridade, ou aceitar que pessoa física não tem perfil —, e a classificação da nota precisa
 * dizer qual delas é. Perfil `manual` fica fora do casamento: a tela o alcança por escolha
 * explícita, e a classificação automática nunca.
 */
export function explainEmissionProfile({
  invoice,
  profiles,
}: FindEmissionProfileParams): EmissionProfileExplanation {
  if (!CNPJ_PATTERN.test(invoice.senderTaxId) || !CNPJ_PATTERN.test(invoice.recipientTaxId)) {
    return { reason: 'not_cnpj' }
  }

  const active = profiles.filter(
    (candidate) => candidate.matchMode === 'sender_tax_id' && candidate.status === 'active',
  )
  const matches = active
    .flatMap((candidate) =>
      matchCandidate({
        candidate,
        recipientCityKey: invoice.recipientCityKey,
        recipientTaxId: invoice.recipientTaxId,
        senderTaxId: invoice.senderTaxId,
      }),
    )
    .toSorted(compareMatches)

  const [best, runnerUp] = matches
  if (best === undefined) {
    const coveredByTaxId = active.some(
      (candidate) =>
        matchCandidate({
          candidate,
          recipientCityKey: undefined,
          recipientTaxId: invoice.recipientTaxId,
          senderTaxId: invoice.senderTaxId,
          skipCity: true,
        }).length > 0,
    )
    return { reason: coveredByTaxId ? 'city_not_covered' : 'unmatched' }
  }
  if (runnerUp !== undefined && compareMatches(best, runnerUp) === 0) return { reason: 'ambiguous' }

  return {
    resolution: {
      matchedBy: best.role === 'sender' ? 'sender_tax_id' : 'recipient_tax_id',
      matchedTaxId: best.matchedTaxId,
      precision: best.precision,
      profileId: best.candidate.id,
    },
  }
}

/**
 * A política de serviço municipal que rege uma nota. Mora aqui, e não em cada consumidor, porque
 * **dois** fazem a mesma pergunta — a listagem de notas e a seleção do lote de CT-e. Se cada um a
 * respondesse do seu jeito, a tela mostraria um bloqueio que a seleção não aplica, ou o contrário.
 *
 * Ausência de perfil, empate e participante sem CNPJ caem todos em `allow`: ninguém escolheu
 * bloquear, e o padrão do produto é não bloquear.
 */
export function resolveMunicipalServicePolicy({
  profiles,
  recipientCityKey,
  recipientTaxId,
  senderTaxId,
}: {
  readonly profiles: readonly (EmissionProfileCandidate & {
    readonly municipalServicePolicy: CteMunicipalServicePolicy
  })[]
  readonly recipientCityKey?: string | null | undefined
  readonly recipientTaxId: string | null
  readonly senderTaxId: string | null
}): CteMunicipalServicePolicy {
  if (senderTaxId === null || recipientTaxId === null) return 'allow'

  const resolution = findEmissionProfile({
    invoice: { recipientCityKey, recipientTaxId, senderTaxId },
    profiles,
  })
  if (resolution === null) return 'allow'

  return (
    profiles.find((profile) => profile.id === resolution.profileId)?.municipalServicePolicy ??
    'allow'
  )
}

function resolveRequestedProfile(
  profiles: readonly EmissionProfileCandidate[],
  requestedProfileId: string,
): EmissionProfileResolution {
  const requested = profiles.find((candidate) => candidate.id === requestedProfileId)
  if (requested === undefined) throw new CteEmissionProfileNotFoundError()
  if (requested.status !== 'active') throw new CteEmissionProfileInactiveError()

  return {
    matchedBy: 'manual',
    matchedTaxId: null,
    precision: 'none',
    profileId: requested.id,
  }
}

function matchCandidate({
  candidate,
  recipientCityKey,
  recipientTaxId,
  senderTaxId,
  skipCity = false,
}: {
  readonly candidate: EmissionProfileCandidate
  readonly recipientCityKey?: string | null | undefined
  readonly recipientTaxId: string
  readonly senderTaxId: string
  readonly skipCity?: boolean
}): readonly ProfileMatch[] {
  if (!skipCity && !coversCity(candidate, recipientCityKey)) return []

  const bestByRole = new Map<CteEmissionMatchRole, ProfileMatch>()

  for (const matcher of candidate.matchers) {
    const partyTaxId = matcher.matchRole === 'sender' ? senderTaxId : recipientTaxId
    const precision = matchPrecision(matcher.taxId, partyTaxId)
    if (precision === undefined) continue

    const match: ProfileMatch = {
      candidate,
      matchedTaxId: matcher.taxId,
      precision,
      role: matcher.matchRole,
    }
    const current = bestByRole.get(matcher.matchRole)
    if (current === undefined || compareMatches(match, current) < 0) {
      bestByRole.set(matcher.matchRole, match)
    }
  }

  return [...bestByRole.values()]
}

/** Sem lista, o perfil serve a qualquer cidade; com lista, só a cidade conhecida e listada. */
function coversCity(
  candidate: EmissionProfileCandidate,
  recipientCityKey: string | null | undefined,
): boolean {
  const cities = candidate.destinationCities
  if (cities === undefined || cities === null) return true
  if (recipientCityKey === undefined || recipientCityKey === null) return false
  return cities.includes(recipientCityKey)
}

function matchPrecision(matcherTaxId: string, partyTaxId: string): 'full' | 'root' | undefined {
  if (matcherTaxId === partyTaxId) return 'full'
  if (matcherTaxId === partyTaxId.slice(0, TAX_ID_ROOT_LENGTH)) return 'root'
  return undefined
}

function compareMatches(left: ProfileMatch, right: ProfileMatch): number {
  const byPrecision = PRECISION_RANK[left.precision] - PRECISION_RANK[right.precision]
  if (byPrecision !== 0) return byPrecision

  const byRole = ROLE_RANK[left.role] - ROLE_RANK[right.role]
  if (byRole !== 0) return byRole

  if (left.candidate.priority === right.candidate.priority) return 0
  return left.candidate.priority < right.candidate.priority ? -1 : 1
}

function assertFullTaxId(value: string): string {
  if (!CNPJ_PATTERN.test(value)) throw new CteEmissionProfileInvalidTaxIdError()
  return value
}
