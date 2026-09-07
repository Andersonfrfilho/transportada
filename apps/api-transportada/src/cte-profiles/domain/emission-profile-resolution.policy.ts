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
  CteEmissionProfileInactiveError,
  CteEmissionProfileInvalidTaxIdError,
  CteEmissionProfileNotFoundError,
  CteEmissionProfileUnresolvedError,
} from './cte-profile.error.js'
import { CNPJ_PATTERN } from '../../shared/tax-id.service.js'

const TAX_ID_ROOT_LENGTH = 14 - 6

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
}

export type EmissionProfileInvoiceParties = {
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
  const matches = profiles
    .filter((candidate) => candidate.matchMode === 'sender_tax_id' && candidate.status === 'active')
    .flatMap((candidate) => matchCandidate({ candidate, recipientTaxId, senderTaxId }))
    .toSorted(compareMatches)

  const [best, runnerUp] = matches
  if (best === undefined) throw new CteEmissionProfileUnresolvedError()
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
export function findEmissionProfile({
  invoice,
  profiles,
}: {
  readonly invoice: EmissionProfileInvoiceParties
  readonly profiles: readonly EmissionProfileCandidate[]
}): EmissionProfileResolution | null {
  if (!CNPJ_PATTERN.test(invoice.senderTaxId) || !CNPJ_PATTERN.test(invoice.recipientTaxId)) {
    return null
  }

  const matches = profiles
    .filter((candidate) => candidate.matchMode === 'sender_tax_id' && candidate.status === 'active')
    .flatMap((candidate) =>
      matchCandidate({
        candidate,
        recipientTaxId: invoice.recipientTaxId,
        senderTaxId: invoice.senderTaxId,
      }),
    )
    .toSorted(compareMatches)

  const [best, runnerUp] = matches
  if (best === undefined) return null
  if (runnerUp !== undefined && compareMatches(best, runnerUp) === 0) return null

  return {
    matchedBy: best.role === 'sender' ? 'sender_tax_id' : 'recipient_tax_id',
    matchedTaxId: best.matchedTaxId,
    precision: best.precision,
    profileId: best.candidate.id,
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
  recipientTaxId,
  senderTaxId,
}: {
  readonly profiles: readonly (EmissionProfileCandidate & {
    readonly municipalServicePolicy: CteMunicipalServicePolicy
  })[]
  readonly recipientTaxId: string | null
  readonly senderTaxId: string | null
}): CteMunicipalServicePolicy {
  if (senderTaxId === null || recipientTaxId === null) return 'allow'

  const resolution = findEmissionProfile({
    invoice: { recipientTaxId, senderTaxId },
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
  recipientTaxId,
  senderTaxId,
}: {
  readonly candidate: EmissionProfileCandidate
  readonly recipientTaxId: string
  readonly senderTaxId: string
}): readonly ProfileMatch[] {
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
