/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteEmissionMatchRole,
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
