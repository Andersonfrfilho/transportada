/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (RF8): a regra "todo ano" do feriado municipal e do aniversário da cidade. Ler e
 * escrever é `settings.manage` (é configuração da operação, como a retenção da posição); a empresa e
 * o ator vêm do contexto autenticado e o IP, do resolvedor injetado, nunca do corpo ou do cabeçalho
 * que o cliente manda. Sem `rateLimit`: são escritas de configuração, como as vizinhas.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import {
  API_MUNICIPAL_HOLIDAY_RULES_MATERIALIZATIONS_PATH,
  API_MUNICIPAL_HOLIDAY_RULES_PATH,
} from '../../shared/api.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import type { MunicipalHolidayRulesUseCases } from '../application/municipal-holiday-rules.use-case.js'
import type {
  MunicipalHolidayRuleChanges,
  MunicipalHolidayRuleFields,
} from '../application/municipal-holiday-rule.port.js'
import { jsonData, noContent } from './business-calendar-response.support.js'
import {
  parseCreateRuleBody,
  parseRuleListQuery,
  parseUpdateRuleBody,
  toRuleView,
} from './municipal-holiday-rule.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const RULE_PATH = `${API_MUNICIPAL_HOLIDAY_RULES_PATH}/:id`

type Dependencies = MunicipalHolidayRulesUseCases & { readonly resolveClientIp: ClientIpResolver }
type RequestMeta = Pick<BusinessCalendarActor, 'correlationId' | 'ipAddress'>
type UpdateInput = RequestMeta & {
  readonly changes: MunicipalHolidayRuleChanges
  readonly id: string
}

export function createMunicipalHolidayRuleRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const meta = (params: {
    readonly correlationId: string
    readonly request: Request
  }): RequestMeta => ({
    correlationId: params.correlationId,
    ipAddress: dependencies.resolveClientIp(params.request),
  })

  return [
    defineRoute<{ readonly cityIbgeCode?: string }>({
      async handle({ context, input }) {
        const rules = await dependencies.list.execute({
          companyId: context.scope.companyId,
          ...input,
        })
        return jsonData({ data: rules.map(toRuleView) })
      },
      method: 'GET',
      parse: ({ request }) => parseRuleListQuery(request),
      pathname: API_MUNICIPAL_HOLIDAY_RULES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & MunicipalHolidayRuleFields>({
      async handle({ context, input }) {
        const { created, rule } = await dependencies.create.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toRuleView(rule), status: created ? 201 : 200 })
      },
      method: 'POST',
      parse: async (params) => ({
        ...meta(params),
        ...(await parseCreateRuleBody(params.request)),
      }),
      pathname: API_MUNICIPAL_HOLIDAY_RULES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta>({
      async handle({ context, input }) {
        const summary = await dependencies.materialize.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: summary })
      },
      method: 'POST',
      parse: (params) => meta(params),
      pathname: API_MUNICIPAL_HOLIDAY_RULES_MATERIALIZATIONS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<UpdateInput>({
      async handle({ context, input }) {
        const rule = await dependencies.update.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonData({ data: toRuleView(rule) })
      },
      method: 'PATCH',
      parse: async (params) => ({
        ...meta(params),
        changes: await parseUpdateRuleBody(params.request),
        id: parseUuidPathIdentifier(params.pathParameters.id ?? ''),
      }),
      pathname: RULE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & { readonly id: string }>({
      async handle({ context, input }) {
        await dependencies.remove.execute({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return noContent()
      },
      method: 'DELETE',
      parse: (params) => ({
        ...meta(params),
        id: parseUuidPathIdentifier(params.pathParameters.id ?? ''),
      }),
      pathname: RULE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
