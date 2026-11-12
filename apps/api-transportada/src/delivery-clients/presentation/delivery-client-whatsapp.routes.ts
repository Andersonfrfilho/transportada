/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b: os números de WhatsApp do cliente de entrega no painel — listar, adicionar, trocar rótulo ou número e
 * remover. Ler é `fleet.read` e escrever é `fleet.manage`, como o cadastro de e-mails (279). O número em claro só entra
 * no corpo do `POST`/`PATCH`; toda resposta leva a forma mascarada.
 */
import { z } from 'zod'

import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_DELIVERY_CLIENTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH } from '../../shared/delivery-client-email.constant.js'
import type { DeliveryClientEmailActor } from '../application/delivery-client-email.port.js'
import type { DeliveryClientWhatsApp } from '../application/delivery-client-whatsapp.port.js'
import type { DeliveryClientWhatsAppUseCase } from '../application/delivery-client-whatsapp.use-case.js'
import { parseTaxIdPath } from './delivery-client.routes.js'

const NUMBERS_PATH = `${API_DELIVERY_CLIENTS_PATH}/:taxId/whatsapp`
const NUMBER_PATH = `${NUMBERS_PATH}/:numberId`

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const

const labelSchema = z.string().trim().max(DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH)
const numberSchema = z.string().trim().min(1).max(40)
const CREATE_SCHEMA = z
  .object({ label: labelSchema.default(''), number: numberSchema })
  .strict()
  .readonly()
const UPDATE_SCHEMA = z
  .object({ label: labelSchema.optional(), number: numberSchema.optional() })
  .strict()
  .refine((body) => body.label !== undefined || body.number !== undefined)
  .readonly()

type RequestMeta = { readonly correlationId: string; readonly ipAddress: string }

export type DeliveryClientWhatsAppRoutesDependencies = {
  readonly numbers: DeliveryClientWhatsAppUseCase
  readonly resolveClientIp: (request: Request) => string
}

export function createDeliveryClientWhatsAppRoutes(
  dependencies: DeliveryClientWhatsAppRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { numbers } = dependencies

  function actorOf(context: CompanyContext, meta: RequestMeta): DeliveryClientEmailActor {
    return {
      companyId: context.companyId,
      correlationId: meta.correlationId,
      ipAddress: meta.ipAddress,
      userId: context.userId,
    }
  }

  function metaOf(correlationId: string, request: Request): RequestMeta {
    return { correlationId, ipAddress: dependencies.resolveClientIp(request) }
  }

  return [
    defineRoute<{ readonly taxId: string }>({
      async handle({ context, input }): Promise<Response> {
        const list = await numbers.list({ companyId: context.scope.companyId, taxId: input.taxId })
        return jsonResponse({ body: { data: list.map(serialize) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ taxId: parseTaxIdPath(pathParameters.taxId ?? '') }),
      pathParameterFormat: 'opaque',
      pathname: NUMBERS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<
      RequestMeta & { readonly label: string; readonly number: string; readonly taxId: string }
    >({
      async handle({ context, input }): Promise<Response> {
        const created = await numbers.add({
          actor: actorOf(context.scope, input),
          label: input.label,
          number: input.number,
          taxId: input.taxId,
        })
        return jsonResponse({ body: { data: serialize(created) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(CREATE_SCHEMA, request)
        return {
          ...metaOf(correlationId, request),
          label: body.label,
          number: body.number,
          taxId: parseTaxIdPath(pathParameters.taxId ?? ''),
        }
      },
      pathParameterFormat: 'opaque',
      pathname: NUMBERS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<
      RequestMeta & {
        readonly label?: string
        readonly number?: string
        readonly numberId: string
        readonly taxId: string
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const updated = await numbers.update({
          actor: actorOf(context.scope, input),
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(input.number === undefined ? {} : { number: input.number }),
          numberId: input.numberId,
          taxId: input.taxId,
        })
        return jsonResponse({ body: { data: serialize(updated) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(UPDATE_SCHEMA, request)
        return {
          ...metaOf(correlationId, request),
          ...(body.label === undefined ? {} : { label: body.label }),
          ...(body.number === undefined ? {} : { number: body.number }),
          numberId: parseUuidPathIdentifier(pathParameters.numberId ?? ''),
          taxId: parseTaxIdPath(pathParameters.taxId ?? ''),
        }
      },
      pathParameterFormat: 'opaque',
      pathname: NUMBER_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & { readonly numberId: string; readonly taxId: string }>({
      async handle({ context, input }): Promise<Response> {
        await numbers.remove({
          actor: actorOf(context.scope, input),
          numberId: input.numberId,
          taxId: input.taxId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters, request }) => ({
        ...metaOf(correlationId, request),
        numberId: parseUuidPathIdentifier(pathParameters.numberId ?? ''),
        taxId: parseTaxIdPath(pathParameters.taxId ?? ''),
      }),
      pathParameterFormat: 'opaque',
      pathname: NUMBER_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

function serialize(number: DeliveryClientWhatsApp) {
  return {
    createdAt: number.createdAt.toISOString(),
    createdByKind: number.createdByKind,
    id: number.id,
    label: number.label,
    numberMasked: number.numberMasked,
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
