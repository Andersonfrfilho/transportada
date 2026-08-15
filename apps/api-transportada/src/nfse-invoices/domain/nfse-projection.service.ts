/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  type ChargeComponentDefinition,
  type ChargeComponentPricing,
  type ComposedChargeComponent,
  composeCharge,
  roundChargeToFiscalScale,
} from '../../cte-profiles/domain/charge-composition.service.js'
import {
  type FreightRuleSnapshot,
  parseMoney,
} from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import {
  FISCAL_MONEY_SCALE,
  MONEY_SCALE,
  PERCENTAGE_FACTOR,
  PERCENTAGE_SCALE,
  applyRate,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { NfseIssRateOutOfRangeError } from './nfse-issuance.error.js'

const ERROR_CODE_PREFIX = 'NFSE'

export type NfseProjectionDocument = {
  readonly accessKey: string
  readonly documentId: string
  readonly issuedAt: string
  readonly number: string
  readonly series: string
  readonly takerLegalName: string
  readonly takerTaxId: string
  readonly totalAmount: string
}

export type NfseProjectionProfile = {
  readonly chargeComponentLabel: string
  readonly components: readonly ChargeComponentDefinition[]
  readonly id: string
  readonly issRate: string
  readonly ruleSnapshot: FreightRuleSnapshot
}

export type NfseProjectionCandidate = {
  readonly document: NfseProjectionDocument
  readonly profile: NfseProjectionProfile
}

export type NfseProjectionAdjustment = {
  readonly amount: string
  readonly type: 'minimum_amount' | 'maximum_amount'
}

export type NfseProjectionItem = {
  readonly accessKey: string
  readonly documentId: string
  readonly issuedAt: string
  readonly number: string
  readonly series: string
  readonly totalAmount: string
}

export type NfseProjection = {
  readonly adjustments: readonly NfseProjectionAdjustment[]
  readonly baseAmount: string
  readonly calculatedAmount: string
  readonly charges: readonly ChargeComponentPricing[]
  readonly components: readonly ComposedChargeComponent[]
  readonly documents: readonly NfseProjectionItem[]
  readonly fiscalComponents: readonly ComposedChargeComponent[]
  readonly issAmount: string
  readonly issRate: string
  readonly percentage: string
  readonly profileId: string
  readonly serviceAmount: string
  readonly takerLegalName: string
  readonly takerTaxId: string
}

type CandidateGroup = readonly [NfseProjectionCandidate, ...NfseProjectionCandidate[]]

/**
 * O serviço prestado é o mesmo frete do CT-e, então o valor sai do mesmo motor: só o documento
 * fiscal muda. Uma nota de serviço com dois tomadores é inválida, por isso o agrupamento é por
 * tomador — a seleção inteira vira uma nota quando o tomador é o mesmo.
 */
export function projectNfseInvoices(
  candidates: readonly NfseProjectionCandidate[],
): readonly NfseProjection[] {
  const groups = new Map<string, [NfseProjectionCandidate, ...NfseProjectionCandidate[]]>()
  for (const candidate of candidates) {
    const key = `${candidate.profile.id}|${candidate.document.takerTaxId}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [candidate])
    else group.push(candidate)
  }

  return [...groups.values()].map(projectGroup)
}

function projectGroup(group: CandidateGroup): NfseProjection {
  const [first] = group
  const cargoScaled = group.reduce(
    (total, candidate) => total + parseMoney(candidate.document.totalAmount),
    0n,
  )
  const charge = composeCharge({
    cargoAmount: formatScaledDecimal(cargoScaled, MONEY_SCALE),
    components: first.profile.components,
    mainComponentLabel: first.profile.chargeComponentLabel,
    referenceDate: resolveReferenceDate(group),
    ruleSnapshot: first.profile.ruleSnapshot,
  })
  const fiscalCharge = roundChargeToFiscalScale(charge)

  return {
    adjustments: charge.adjustments.map((adjustment) => ({
      amount: adjustment.amount,
      type: adjustment.type,
    })),
    baseAmount: charge.cargoAmount,
    calculatedAmount: charge.totalAmount,
    charges: charge.pricing,
    components: charge.components,
    documents: group.map((candidate) => ({
      accessKey: candidate.document.accessKey,
      documentId: candidate.document.documentId,
      issuedAt: candidate.document.issuedAt,
      number: candidate.document.number,
      series: candidate.document.series,
      totalAmount: candidate.document.totalAmount,
    })),
    fiscalComponents: fiscalCharge.components,
    issAmount: calculateIssAmount({
      issRate: first.profile.issRate,
      serviceAmount: fiscalCharge.totalAmount,
    }),
    issRate: first.profile.issRate,
    percentage: first.profile.ruleSnapshot.percentage,
    profileId: first.profile.id,
    serviceAmount: fiscalCharge.totalAmount,
    takerLegalName: first.document.takerLegalName,
    takerTaxId: first.document.takerTaxId,
  }
}

/** O ISS incide sobre o serviço prestado, não sobre o valor da carga transportada. */
function calculateIssAmount({
  issRate,
  serviceAmount,
}: {
  readonly issRate: string
  readonly serviceAmount: string
}): string {
  const rateScaled = parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: PERCENTAGE_SCALE,
    value: issRate,
  })
  if (rateScaled > PERCENTAGE_FACTOR) throw new NfseIssRateOutOfRangeError()

  const amountScaled = parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: FISCAL_MONEY_SCALE,
    value: serviceAmount,
  })

  return formatScaledDecimal(applyRate({ amountScaled, rateScaled }), FISCAL_MONEY_SCALE)
}

function resolveReferenceDate(group: CandidateGroup): string {
  return group.reduce((latest, candidate) => {
    return Date.parse(candidate.document.issuedAt) > Date.parse(latest)
      ? candidate.document.issuedAt
      : latest
  }, group[0].document.issuedAt)
}
