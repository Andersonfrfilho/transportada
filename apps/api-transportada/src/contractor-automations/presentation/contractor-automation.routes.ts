/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 285: cadastro da automação do fluxo semanal. Exige `settings.manage`; a empresa e o ator vêm só do
 * contexto autenticado.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_CONTRACTOR_AUTOMATIONS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  ContractorAutomation,
  ContractorAutomationActor,
  ContractorAutomationFields,
} from '../application/contractor-automation.port.js'
import {
  parseContractorAutomationBody,
  type ContractorAutomationBody,
} from './contractor-automation.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const ITEM_PATH = `${API_CONTRACTOR_AUTOMATIONS_PATH}/:id`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly create: {
    execute(
      params: ContractorAutomationActor & { readonly fields: ContractorAutomationFields },
    ): Promise<ContractorAutomation>
  }
  readonly list: {
    execute(params: { readonly companyId: string }): Promise<readonly ContractorAutomation[]>
  }
  readonly resolveClientIp: ClientIpResolver
  readonly update: {
    execute(
      params: ContractorAutomationActor & {
        readonly fields: ContractorAutomationFields
        readonly id: string
      },
    ): Promise<ContractorAutomation>
  }
}

type WriteInput = {
  readonly body: ContractorAutomationBody
  readonly correlationId: string
  readonly ipAddress: string
}

export function createContractorAutomationRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const automations = await dependencies.list.execute({ companyId: context.scope.companyId })
        return jsonResponse({ data: automations.map(serialize) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CONTRACTOR_AUTOMATIONS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<WriteInput>({
      async handle({ context, input }): Promise<Response> {
        const created = await dependencies.create.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          fields: input.body,
          ipAddress: input.ipAddress,
          userId: context.scope.userId,
        })
        return jsonResponse({ data: serialize(created) }, 201)
      },
      method: 'POST',
      parse: async ({ correlationId, request }) => ({
        body: await parseContractorAutomationBody(request),
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
      }),
      pathname: API_CONTRACTOR_AUTOMATIONS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<WriteInput & { readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const updated = await dependencies.update.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          fields: input.body,
          id: input.id,
          ipAddress: input.ipAddress,
          userId: context.scope.userId,
        })
        return jsonResponse({ data: serialize(updated) })
      },
      method: 'PUT',
      parse: async ({ correlationId, pathParameters, request }) => ({
        body: await parseContractorAutomationBody(request),
        correlationId,
        id: parseUuidPathIdentifier(pathParameters.id ?? ''),
        ipAddress: dependencies.resolveClientIp(request),
      }),
      pathname: ITEM_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

/** Lista branca de campos: o objeto do repositório nunca é espalhado na resposta. */
function serialize(automation: ContractorAutomation): Record<string, unknown> {
  return {
    billingDueDays: automation.billingDueDays,
    createdAt: automation.createdAt.toISOString(),
    enabled: automation.enabled,
    id: automation.id,
    name: automation.name,
    nfseCity: automation.nfseCity,
    partSize: automation.partSize,
    recipients: automation.recipients,
    updatedAt: automation.updatedAt.toISOString(),
    xmlKind: automation.xmlKind,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}
