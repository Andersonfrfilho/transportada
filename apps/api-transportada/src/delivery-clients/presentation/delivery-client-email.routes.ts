/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF1. Ler é `fleet.read` e escrever é `fleet.manage`, como o resto do cadastro do cliente
 * (D5). O endereço em claro só entra no corpo do `POST`; toda resposta leva a forma mascarada.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_DELIVERY_CLIENTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { DeliveryClientEmailPurpose } from '../../shared/delivery-client-email.constant.js'
import type {
  DeliveryClientEmail,
  DeliveryClientEmailActor,
} from '../application/delivery-client-email.port.js'
import { parseTaxIdPath } from './delivery-client.routes.js'
import {
  parseCreateDeliveryClientEmail,
  parseDeliveryClientEmailTypeFilter,
  parseUpdateDeliveryClientEmail,
} from './delivery-client-email.schema.js'

const EMAILS_PATH = `${API_DELIVERY_CLIENTS_PATH}/:taxId/emails`
const EMAIL_PATH = `${EMAILS_PATH}/:emailId`

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const

type RequestMeta = { readonly correlationId: string; readonly ipAddress: string }

export type DeliveryClientEmailRoutesDependencies = {
  readonly addEmail: {
    execute(input: {
      readonly actor: DeliveryClientEmailActor
      readonly address: string
      readonly label: string
      readonly purpose: DeliveryClientEmailPurpose
      readonly taxId: string
    }): Promise<DeliveryClientEmail>
  }
  readonly listEmails: {
    execute(input: {
      readonly companyId: string
      readonly purpose?: DeliveryClientEmailPurpose
      readonly taxId: string
    }): Promise<readonly DeliveryClientEmail[]>
  }
  readonly removeEmail: {
    execute(input: {
      readonly actor: DeliveryClientEmailActor
      readonly emailId: string
      readonly taxId: string
    }): Promise<void>
  }
  readonly resolveClientIp: (request: Request) => string
  readonly updateEmailLabel: {
    execute(input: {
      readonly actor: DeliveryClientEmailActor
      readonly emailId: string
      readonly label: string
      readonly taxId: string
    }): Promise<DeliveryClientEmail>
  }
}

export function createDeliveryClientEmailRoutes(
  dependencies: DeliveryClientEmailRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  function actorOf(context: CompanyContext, meta: RequestMeta): DeliveryClientEmailActor {
    return {
      companyId: context.companyId,
      correlationId: meta.correlationId,
      ipAddress: meta.ipAddress,
      userId: context.userId,
    }
  }

  function requestMeta(correlationId: string, request: Request): RequestMeta {
    return { correlationId, ipAddress: dependencies.resolveClientIp(request) }
  }

  return [
    defineRoute<{ readonly purpose?: DeliveryClientEmailPurpose; readonly taxId: string }>({
      async handle({ context, input }): Promise<Response> {
        const emails = await dependencies.listEmails.execute({
          companyId: context.scope.companyId,
          ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
          taxId: input.taxId,
        })

        return jsonResponse({ body: { data: emails.map(serializeEmail) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => ({
        ...parseDeliveryClientEmailTypeFilter(new URL(request.url)),
        taxId: parseTaxIdPath(pathParameters.taxId ?? ''),
      }),
      pathParameterFormat: 'opaque',
      pathname: EMAILS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<
      RequestMeta & {
        readonly address: string
        readonly label: string
        readonly purpose: DeliveryClientEmailPurpose
        readonly taxId: string
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const created = await dependencies.addEmail.execute({
          actor: actorOf(context.scope, input),
          address: input.address,
          label: input.label,
          purpose: input.purpose,
          taxId: input.taxId,
        })

        return jsonResponse({ body: { data: serializeEmail(created) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        return {
          ...requestMeta(correlationId, request),
          ...(await parseCreateDeliveryClientEmail(request)),
          taxId: parseTaxIdPath(pathParameters.taxId ?? ''),
        }
      },
      pathParameterFormat: 'opaque',
      pathname: EMAILS_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<
      RequestMeta & {
        readonly emailId: string
        readonly label: string
        readonly taxId: string
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const updated = await dependencies.updateEmailLabel.execute({
          actor: actorOf(context.scope, input),
          emailId: input.emailId,
          label: input.label,
          taxId: input.taxId,
        })

        return jsonResponse({ body: { data: serializeEmail(updated) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        return {
          ...requestMeta(correlationId, request),
          emailId: parseUuidPathIdentifier(pathParameters.emailId ?? ''),
          ...(await parseUpdateDeliveryClientEmail(request)),
          taxId: parseTaxIdPath(pathParameters.taxId ?? ''),
        }
      },
      pathParameterFormat: 'opaque',
      pathname: EMAIL_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<RequestMeta & { readonly emailId: string; readonly taxId: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.removeEmail.execute({
          actor: actorOf(context.scope, input),
          emailId: input.emailId,
          taxId: input.taxId,
        })

        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters, request }) => ({
        ...requestMeta(correlationId, request),
        emailId: parseUuidPathIdentifier(pathParameters.emailId ?? ''),
        taxId: parseTaxIdPath(pathParameters.taxId ?? ''),
      }),
      pathParameterFormat: 'opaque',
      pathname: EMAIL_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

function serializeEmail(email: DeliveryClientEmail) {
  return {
    addressMasked: email.addressMasked,
    createdAt: email.createdAt.toISOString(),
    createdByKind: email.createdByKind,
    id: email.id,
    label: email.label,
    purpose: email.purpose,
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
