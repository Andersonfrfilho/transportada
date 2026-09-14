/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  projectIcmsAmount,
  type IcmsProfileRates,
} from '../../cte-issuance/domain/cte-icms.policy.js'
import {
  findEmissionProfile,
  type EmissionProfileCandidate,
} from '../../cte-profiles/domain/emission-profile-resolution.policy.js'
import { VALUATION_GAPS, type TripRevenueLine, type ValuationGap } from './trip-valuation.policy.js'

/** Um perfil ativo de emissão com o que decide o ICMS dele. */
export type IcmsEmissionProfile = EmissionProfileCandidate & IcmsProfileRates

/**
 * O ICMS de uma nota na conta da viagem, e de onde ele veio.
 *
 * - `measured` — o `vICMS` do CT-e autorizado; o documento vence sempre;
 * - `projected` — o que o perfil que rege a nota vai destacar sobre a receita prevista dela;
 * - `missing` — não há base (receita ausente), perfil (nenhum, empate, participante sem CNPJ) ou o
 *   CST é o que o produto não emite.
 */
export type DocumentIcms =
  | { readonly amount: string; readonly status: 'measured' }
  | {
      readonly amount: string
      readonly baseReductionRate: string
      readonly cst: string
      readonly profileId: string
      readonly rate: string
      readonly status: 'projected'
    }
  | { readonly gap: ValuationGap; readonly status: 'missing' }

export type ResolveDocumentIcmsParams = {
  /** O `vICMS` do CT-e autorizado da nota; `null` enquanto não há documento. */
  readonly measuredIcms: null | string
  readonly profiles: readonly IcmsEmissionProfile[]
  readonly recipientTaxId: null | string
  /** A linha de receita **desta** nota na conta — é a base do imposto (spec 125 D2). */
  readonly revenue: TripRevenueLine
  readonly senderTaxId: null | string
}

/**
 * Spec 125: **o ICMS se projeta pelo perfil de emissão até o CT-e existir.**
 *
 * O perfil é o que `findEmissionProfile` escolhe — o mesmo seam sem lançar que a política de
 * serviço municipal usa —, então a conta projeta pelo perfil que a emissão vai de fato usar. Empate
 * não escolhe (D4): a emissão recusaria, e a conta diz o mesmo.
 */
export function resolveDocumentIcms(input: ResolveDocumentIcmsParams): DocumentIcms {
  if (input.measuredIcms !== null) return { amount: input.measuredIcms, status: 'measured' }
  if (input.revenue.source === 'missing') {
    return { gap: VALUATION_GAPS.noFreightRule, status: 'missing' }
  }

  const profile = chooseProfile(input)
  if (profile === undefined) return { gap: VALUATION_GAPS.noEmissionProfile, status: 'missing' }

  const projection = projectIcmsAmount({ amount: input.revenue.amount, profile })
  if (projection.status === 'unsupported') {
    return { gap: VALUATION_GAPS.icmsCstUnsupported, status: 'missing' }
  }

  return {
    amount: projection.amount,
    baseReductionRate: profile.icmsBaseReductionRate,
    cst: profile.icmsCst,
    profileId: profile.id,
    rate: profile.icmsRate,
    status: 'projected',
  }
}

function chooseProfile(input: ResolveDocumentIcmsParams): IcmsEmissionProfile | undefined {
  if (input.senderTaxId === null || input.recipientTaxId === null) return undefined

  const resolution = findEmissionProfile({
    invoice: { recipientTaxId: input.recipientTaxId, senderTaxId: input.senderTaxId },
    profiles: input.profiles,
  })
  if (resolution === null) return undefined

  return input.profiles.find((profile) => profile.id === resolution.profileId)
}
