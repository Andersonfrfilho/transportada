/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T10/T11: as duas rotas do portal — `GET /client/me/occurrences` (`deliveries.track`,
 * quem acompanha a carga também enxerga a tratativa) e `POST /client/me/occurrences/:id/decision`
 * (`occurrences.decide`). `cache-control: no-store` nas duas, e a serialização é campo a campo — o
 * rodapé de `plan.md` da spec 164 lista o que nunca sai daqui: `actor_user_id`,
 * `on_behalf_of_driver_id`, `channel`, qualquer id interno (`tripId`/`stopId`/`tripDocumentId`/
 * `occurrenceTypeId`), `bucket`/`objectKey`, `redelivery_policy`/`redelivery_application`,
 * `decided_by_user_id` e o histórico de eventos.
 *
 * RF13: sem a nota, os itens e a observação o contratante não tem como decidir — a listagem
 * acrescenta `nfe` (número/série/chave, o mesmo recorte que o resto do portal já expõe), `items`
 * (código, descrição e quantidade dos produtos apontados; lista vazia é a nota inteira) e `note`.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_CLIENT_OCCURRENCES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { TRIP_OCCURRENCE_CASE_DECISION_KINDS } from '../../database/trip.schema.js'
import type { TripOccurrenceCaseDecisionKind } from '../../database/trip.schema.js'
import type { OccurrenceAttachmentView } from '../../trips/application/occurrence-attachment.service.js'
import type {
  ContractorOccurrenceCaseTransition,
  DecideOccurrenceCaseUseCase,
} from '../application/decide-occurrence-case.use-case.js'
import type {
  ContractorOccurrenceItem,
  ContractorOccurrenceListItem,
} from '../infrastructure/contractor-occurrence.query.js'

const TRACK_POLICY = { permission: 'deliveries.track', scope: 'company' } as const
const DECIDE_POLICY = { permission: 'occurrences.decide', scope: 'company' } as const

const OCCURRENCE_DECISION_PATH = `${API_CLIENT_OCCURRENCES_PATH}/:id/decision`

const MAX_NOTE_LENGTH = 2000

const decisionSchema = z
  .object({
    kind: z.enum(TRIP_OCCURRENCE_CASE_DECISION_KINDS),
    note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
  })
  .strict()

export type ContractorOccurrenceRoutesDependencies = {
  readonly decideOccurrenceCase: DecideOccurrenceCaseUseCase
  /** Spec 164 T11: a foto — reuso do gateway de presigned de 5 min, sem `objectKey`/`bucket`. */
  readonly readAttachments: (input: {
    readonly context: CompanyContext
    readonly occurrenceId: string
  }) => Promise<readonly OccurrenceAttachmentView[]>
}

export function createContractorOccurrenceRoutes(
  dependencies: ContractorOccurrenceRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const occurrences = await dependencies.decideOccurrenceCase.list({ context: context.scope })
        const data = await Promise.all(
          occurrences.map((occurrence) => serialize(dependencies, context.scope, occurrence)),
        )

        return jsonResponse({ body: { data }, status: 200 })
      },
      method: 'GET',
      parse: () => ({}) as Record<string, never>,
      pathname: API_CLIENT_OCCURRENCES_PATH,
      policy: TRACK_POLICY,
    }),
    defineRoute<{
      readonly kind: TripOccurrenceCaseDecisionKind
      readonly note?: string
      readonly occurrenceId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.decideOccurrenceCase.decide({
          context: context.scope,
          kind: input.kind,
          occurrenceId: input.occurrenceId,
          ...(input.note === undefined ? {} : { note: input.note }),
        })

        return jsonResponse({ body: { data: serializeTransition(result) }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(decisionSchema, request)
        return {
          kind: body.kind,
          occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(body.note === undefined ? {} : { note: body.note }),
        }
      },
      pathname: OCCURRENCE_DECISION_PATH,
      policy: DECIDE_POLICY,
    }),
  ]
}

async function serialize(
  dependencies: ContractorOccurrenceRoutesDependencies,
  context: CompanyContext,
  occurrence: ContractorOccurrenceListItem,
): Promise<Record<string, unknown>> {
  const attachments = await dependencies.readAttachments({
    context,
    occurrenceId: occurrence.occurrenceId,
  })

  return {
    attachments: attachments.map(serializeAttachment),
    caseStatus: occurrence.caseStatus,
    decidedAt: occurrence.decidedAt,
    decisionKind: occurrence.decisionKind,
    items: occurrence.items.map(serializeItem),
    nfe: {
      accessKey: occurrence.nfeAccessKey,
      number: occurrence.nfeNumber,
      series: occurrence.nfeSeries,
    },
    note: occurrence.note,
    occurrenceId: occurrence.occurrenceId,
    occurrenceTypeName: occurrence.occurrenceTypeName,
    openedAt: occurrence.openedAt,
    stage: occurrence.stage,
  }
}

function serializeItem(item: ContractorOccurrenceItem): Record<string, unknown> {
  return {
    code: item.code,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
  }
}

function serializeAttachment(attachment: OccurrenceAttachmentView): Record<string, unknown> {
  return {
    downloadUrl: attachment.downloadUrl,
    expired: attachment.expired,
    id: attachment.id,
    position: attachment.position,
    thumbnailUrl: attachment.thumbnailUrl,
  }
}

function serializeTransition(result: ContractorOccurrenceCaseTransition): Record<string, unknown> {
  return { kind: result.kind, status: result.status }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
