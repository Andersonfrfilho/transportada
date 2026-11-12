/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108): as leituras do editor "E-mail à contratante" do tipo de ocorrência — os modelos do módulo de
 * notificação que o tipo pode escolher e os contatos que podem ser destinatários. Mesma política da gravação do tipo
 * (`settings.manage`): o módulo, sozinho, deixa qualquer membro ler os modelos, então a TMS lê pelo próprio caminho.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { invalidRequest } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ContractorTemplateView } from '../../occurrence-conversation/domain/occurrence-contractor-template.policy.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { OCCURRENCE_TYPE_CONTRACTOR_SCOPE_MAX_CONTRACTORS } from '../../shared/trip-occurrence.constant.js'
import type { ClientChannelTemplateView } from '../domain/occurrence-client-channel-template.policy.js'
import type { OccurrenceTypeMailRecipientView } from '../infrastructure/occurrence-type-mail-view.query.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'
export const OCCURRENCE_TYPE_MAIL_TEMPLATES_PATH = `${OCCURRENCE_TYPES_PATH}/contractor-mail-templates`
/** Spec 286 (RF2): os modelos por canal que a matriz "Retorno ao cliente" pode escolher. */
export const OCCURRENCE_TYPE_CLIENT_CHANNEL_TEMPLATES_PATH = `${OCCURRENCE_TYPES_PATH}/client-channel-templates`
export const OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH = `${OCCURRENCE_TYPES_PATH}/contractor-mail-recipient-candidates`

const contractorIdsSchema = z.array(z.uuid()).max(OCCURRENCE_TYPE_CONTRACTOR_SCOPE_MAX_CONTRACTORS)

export type OccurrenceTypeMailRoutesDependencies = {
  readonly listClientChannelTemplates: {
    execute(input: {
      readonly context: CompanyContext
    }): Promise<readonly ClientChannelTemplateView[]>
  }
  readonly listContractorMailRecipientCandidates: {
    execute(input: {
      readonly context: CompanyContext
      readonly contractorIds: readonly string[]
    }): Promise<readonly OccurrenceTypeMailRecipientView[]>
  }
  readonly listContractorMailTemplates: {
    execute(input: { readonly context: CompanyContext }): Promise<readonly ContractorTemplateView[]>
  }
}

/** `?contractorIds=a,b`: segmentos vazios somem; o que não é uuid, ou passa do teto, é 400. */
function parseContractorIds(url: URL): readonly string[] {
  const raw = url.searchParams.get('contractorIds') ?? ''
  const parsed = contractorIdsSchema.safeParse(
    raw
      .split(',')
      .map((segment) => segment.trim())
      .filter((segment) => segment !== ''),
  )
  if (!parsed.success) throw invalidRequest()
  return parsed.data
}

function json(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

export function createOccurrenceTypeMailRoutes(
  dependencies: OccurrenceTypeMailRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return json(
          await dependencies.listContractorMailTemplates.execute({ context: context.scope }),
        )
      },
      method: 'GET',
      parse: () => undefined,
      pathname: OCCURRENCE_TYPE_MAIL_TEMPLATES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return json(
          await dependencies.listClientChannelTemplates.execute({ context: context.scope }),
        )
      },
      method: 'GET',
      parse: () => undefined,
      pathname: OCCURRENCE_TYPE_CLIENT_CHANNEL_TEMPLATES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly contractorIds: readonly string[] }>({
      async handle({ context, input }): Promise<Response> {
        return json(
          await dependencies.listContractorMailRecipientCandidates.execute({
            context: context.scope,
            contractorIds: input.contractorIds,
          }),
        )
      },
      method: 'GET',
      parse: ({ request }) => ({ contractorIds: parseContractorIds(new URL(request.url)) }),
      pathname: OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
