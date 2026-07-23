/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { FreightCalculationDetail } from '../../freight-calculations/application/freight-simulation.use-case.js'
import type { FreightRuleSummary } from '../../freight-rules/application/freight-rules.use-case.js'
import {
  API_FREIGHT_CALCULATIONS_PATH,
  API_FREIGHT_RULES_PATH,
  API_NFE_DOCUMENTS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import {
  parseCreateFreightRuleRequest,
  parseFreightCalculationList,
  parseFreightRuleList,
  parseIdempotencyKey,
  parseSimulateFreightRequest,
  parseUuidPathIdentifier,
} from './freight.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const FREIGHT_SIMULATE_POLICY = { permission: 'freight.simulate', scope: 'company' } as const

type FreightRuleListInput = {
  readonly cursor: string | null
  readonly limit: number
}

type FreightCalculationListInput = {
  readonly cursor: string | null
  readonly documentId: string
  readonly limit: number
}

type CreateFreightRuleInput = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly description: string
  readonly idempotencyKey: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly name: string
  readonly percentage: string
  readonly priority: string
  readonly validFrom: string
  readonly validUntil: string | null
}

type SimulateFreightInput = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly documentId: string
  readonly idempotencyKey: string
}

type Dependencies = {
  readonly createRule: {
    execute(input: CreateFreightRuleInput): Promise<FreightRuleSummary>
  }
  readonly listCalculations: {
    execute(input: FreightCalculationListInput & { readonly context: CompanyContext }): Promise<{
      readonly items: readonly FreightCalculationDetail[]
      readonly nextCursor: string | null
    }>
  }
  readonly listRules: {
    execute(input: FreightRuleListInput & { readonly context: CompanyContext }): Promise<{
      readonly items: readonly FreightRuleSummary[]
      readonly nextCursor: string | null
    }>
  }
  readonly simulate: {
    execute(input: SimulateFreightInput): Promise<FreightCalculationDetail>
  }
}

export function createFreightRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<FreightRuleListInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listRules.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: {
            data: page.items.map(serializeFreightRule),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseFreightRuleList(new URL(request.url)),
      pathname: API_FREIGHT_RULES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Omit<CreateFreightRuleInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const rule = await dependencies.createRule.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeFreightRule(rule) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          ...(await parseCreateFreightRuleRequest(request)),
        }
      },
      pathname: API_FREIGHT_RULES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Omit<SimulateFreightInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const calculation = await dependencies.simulate.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: { data: serializeFreightCalculation(calculation) },
          status: 201,
        })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return {
          correlationId,
          documentId: (await parseSimulateFreightRequest(request)).documentId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
        }
      },
      pathname: API_FREIGHT_CALCULATIONS_PATH,
      policy: FREIGHT_SIMULATE_POLICY,
    }),
    defineRoute<FreightCalculationListInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listCalculations.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.items.map(serializeFreightCalculation),
            page: { nextCursor: page.nextCursor },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => ({
        documentId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ...parseFreightCalculationList(new URL(request.url)),
      }),
      pathname: `${API_NFE_DOCUMENTS_PATH}/:id/freight-calculations`,
      policy: FREIGHT_SIMULATE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeFreightCalculation(calculation: FreightCalculationDetail): object {
  return {
    adjustments: calculation.adjustments.map((adjustment) => ({ ...adjustment })),
    baseAmount: calculation.baseAmount,
    calculatedAmount: calculation.calculatedAmount,
    calculationDetails: { ...calculation.calculationDetails },
    correlationId: calculation.correlationId,
    createdAt: calculation.createdAt,
    freightRuleId: calculation.freightRuleId,
    freightRuleVersionId: calculation.freightRuleVersionId,
    id: calculation.id,
    maximumAmount: calculation.maximumAmount,
    minimumAmount: calculation.minimumAmount,
    nfeDocumentId: calculation.nfeDocumentId,
    percentage: calculation.percentage,
    ruleSnapshot: { ...calculation.ruleSnapshot },
    ruleVersion: calculation.ruleVersion,
    status: calculation.status,
    totalAmount: calculation.totalAmount,
    updatedAt: calculation.updatedAt,
  }
}

function serializeFreightRule(rule: FreightRuleSummary): object {
  return {
    createdAt: rule.createdAt,
    currentVersion: rule.currentVersion,
    description: rule.description,
    id: rule.id,
    name: rule.name,
    priority: rule.priority,
    status: rule.status,
    type: rule.type,
    updatedAt: rule.updatedAt,
  }
}
