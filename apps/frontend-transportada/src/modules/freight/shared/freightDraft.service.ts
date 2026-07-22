/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightRuleCreate } from './freightClient.service'

const DEFAULT_RULE_DRAFT: FreightRuleCreate = {
  description: 'Percentual padrão da operação',
  maximumAmount: null,
  minimumAmount: null,
  name: 'Regra padrão',
  percentage: '0.035000',
  priority: '10',
  validFrom: '2026-07-01T00:00:00.000Z',
  validUntil: null,
}

function draftError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function createFreightDrafts() {
  return {
    createRuleDraft(input: Record<string, unknown> = {}): FreightRuleCreate {
      if (!isRecord(input)) throw draftError('FREIGHT_INVALID_RULE_DRAFT')
      const allowedKeys = [
        'description',
        'maximumAmount',
        'minimumAmount',
        'name',
        'percentage',
        'priority',
        'validFrom',
        'validUntil',
      ]
      if (Object.keys(input).some((key) => !allowedKeys.includes(key))) {
        throw draftError('FREIGHT_INVALID_RULE_DRAFT')
      }
      return {
        description:
          typeof input.description === 'string'
            ? input.description
            : DEFAULT_RULE_DRAFT.description,
        maximumAmount:
          input.maximumAmount === undefined
            ? DEFAULT_RULE_DRAFT.maximumAmount
            : (input.maximumAmount as null | string),
        minimumAmount:
          input.minimumAmount === undefined
            ? DEFAULT_RULE_DRAFT.minimumAmount
            : (input.minimumAmount as null | string),
        name: typeof input.name === 'string' ? input.name : DEFAULT_RULE_DRAFT.name,
        percentage:
          typeof input.percentage === 'string' ? input.percentage : DEFAULT_RULE_DRAFT.percentage,
        priority: typeof input.priority === 'string' ? input.priority : DEFAULT_RULE_DRAFT.priority,
        validFrom:
          typeof input.validFrom === 'string' ? input.validFrom : DEFAULT_RULE_DRAFT.validFrom,
        validUntil:
          input.validUntil === undefined
            ? DEFAULT_RULE_DRAFT.validUntil
            : (input.validUntil as null | string),
      }
    },
    createSimulationDraft(input: Record<string, unknown>): Readonly<{ documentId: string }> {
      if (!isRecord(input)) throw draftError('FREIGHT_INVALID_SIMULATION_DRAFT')
      if (
        Object.keys(input).length !== 1 ||
        !('documentId' in input) ||
        typeof input.documentId !== 'string'
      ) {
        throw draftError('FREIGHT_INVALID_SIMULATION_DRAFT')
      }
      return { documentId: input.documentId }
    },
  }
}
