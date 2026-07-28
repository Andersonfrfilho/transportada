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
import type { CteEmissionGroupingMode } from '../../database/cte-emission-profile.schema.js'
import {
  type FreightRuleSnapshot,
  parseMoney,
} from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import {
  FISCAL_MONEY_SCALE,
  MONEY_SCALE,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'CTE_BATCH'

export type CteBatchProjectionDocument = {
  readonly accessKey: string
  readonly documentId: string
  readonly issuedAt: string
  readonly number: string
  readonly recipientTaxId: string
  readonly senderTaxId: string
  readonly series: string
  readonly totalAmount: string
}

export type CteBatchProjectionProfile = {
  readonly chargeComponentLabel: string
  readonly components: readonly ChargeComponentDefinition[]
  readonly id: string
  readonly matchedBy: string
  readonly name: string
  readonly resolvedBy: 'auto' | 'manual'
  readonly ruleSnapshot: FreightRuleSnapshot
}

export type CteBatchProjectionCandidate = {
  readonly document: CteBatchProjectionDocument
  readonly groupingMode: CteEmissionGroupingMode
  readonly profile: CteBatchProjectionProfile
}

export type CteBatchProjectionAdjustment = {
  readonly amount: string
  readonly type: 'minimum_amount' | 'maximum_amount'
}

export type CteBatchProjectionItem = {
  readonly accessKey: string
  readonly documentId: string
  readonly number: string
  readonly series: string
  readonly totalAmount: string
}

export type CteBatchProjection = {
  readonly adjustments: readonly CteBatchProjectionAdjustment[]
  readonly baseAmount: string
  readonly calculatedAmount: string
  readonly charges: readonly ChargeComponentPricing[]
  readonly components: readonly ComposedChargeComponent[]
  readonly documents: readonly CteBatchProjectionItem[]
  readonly fiscalAmount: string
  readonly fiscalComponents: readonly ComposedChargeComponent[]
  readonly percentage: string
  readonly profile: {
    readonly groupingMode: CteEmissionGroupingMode
    readonly id: string
    readonly matchedBy: string
    readonly name: string
    readonly resolvedBy: 'auto' | 'manual'
  }
  readonly recipientTaxId: string
  readonly senderTaxId: string
}

type CandidateGroup = readonly [CteBatchProjectionCandidate, ...CteBatchProjectionCandidate[]]

export function projectCteBatchCharges(
  candidates: readonly CteBatchProjectionCandidate[],
): readonly CteBatchProjection[] {
  const groups = new Map<string, [CteBatchProjectionCandidate, ...CteBatchProjectionCandidate[]]>()
  for (const candidate of candidates) {
    const key = resolveGroupKey(candidate)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [candidate])
    else group.push(candidate)
  }

  return [...groups.values()].map(projectGroup)
}

export function sumFiscalAmounts(projections: readonly CteBatchProjection[]): string {
  const totalScaled = projections.reduce(
    (total, projection) => total + parseFiscalAmount(projection.fiscalAmount),
    0n,
  )

  return formatScaledDecimal(totalScaled, FISCAL_MONEY_SCALE)
}

function resolveGroupKey({ document, groupingMode, profile }: CteBatchProjectionCandidate): string {
  if (groupingMode === 'sender_recipient') {
    return `${profile.id}|${document.senderTaxId}|${document.recipientTaxId}`
  }

  return `${profile.id}|${document.documentId}`
}

function projectGroup(group: CandidateGroup): CteBatchProjection {
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
      number: candidate.document.number,
      series: candidate.document.series,
      totalAmount: candidate.document.totalAmount,
    })),
    fiscalAmount: fiscalCharge.totalAmount,
    fiscalComponents: fiscalCharge.components,
    percentage: first.profile.ruleSnapshot.percentage,
    profile: {
      groupingMode: first.groupingMode,
      id: first.profile.id,
      matchedBy: first.profile.matchedBy,
      name: first.profile.name,
      resolvedBy: first.profile.resolvedBy,
    },
    recipientTaxId: first.document.recipientTaxId,
    senderTaxId: first.document.senderTaxId,
  }
}

function resolveReferenceDate(group: CandidateGroup): string {
  return group.reduce((latest, candidate) => {
    return Date.parse(candidate.document.issuedAt) > Date.parse(latest)
      ? candidate.document.issuedAt
      : latest
  }, group[0].document.issuedAt)
}

function parseFiscalAmount(value: string): bigint {
  return parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: FISCAL_MONEY_SCALE,
    value,
  })
}
