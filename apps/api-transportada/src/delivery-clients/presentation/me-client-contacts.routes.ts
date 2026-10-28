/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b (D13): na abertura da ocorrência o motorista vê os contatos do cliente da nota, acrescenta números e
 * e-mails e, do que ele mesmo informou, edita e remove — sem mandar o contato pelo chat. A nota vem do caminho e só
 * vale se for da viagem dele. Leitura é `trip.read`; escrita é `trip.report`. Só a forma mascarada sai.
 */
import { z } from 'zod'

import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_ME_CURRENT_TRIP_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import {
  DELIVERY_CLIENT_CONTACT_CHANNELS,
  DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH,
  type DeliveryClientContactChannel,
} from '../../shared/delivery-client-email.constant.js'
import { DriverNotRegisteredError } from '../../trips/domain/trip.error.js'
import type { DriverClientContactsUseCase } from '../application/driver-client-contacts.use-case.js'
import type {
  DriverClientContact,
  DriverClientContactActor,
} from '../application/driver-client-contact.port.js'

const READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const
const CONTACTS_PATH = `${API_ME_CURRENT_TRIP_PATH}/documents/:documentId/client-contacts`
const CONTACT_PATH = `${CONTACTS_PATH}/:contactId`

const labelSchema = z.string().trim().max(DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH)
const addressSchema = z.string().trim().min(1).max(DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH)

const CREATE_SCHEMA = z
  .object({
    address: addressSchema,
    channel: z.enum(DELIVERY_CLIENT_CONTACT_CHANNELS),
    label: labelSchema.default(''),
  })
  .strict()
  .readonly()

const UPDATE_SCHEMA = z
  .object({ address: addressSchema.optional(), label: labelSchema.optional() })
  .strict()
  .refine((body) => body.address !== undefined || body.label !== undefined)
  .readonly()

export type MeClientContactsRoutesDependencies = {
  readonly contacts: DriverClientContactsUseCase
  readonly resolveDriverId: (context: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<null | string>
}

export function createMeClientContactsRoutes(
  dependencies: MeClientContactsRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  async function actorOf(
    scope: { readonly companyId: string; readonly membershipId: string; readonly userId: string },
    correlationId: string,
  ): Promise<DriverClientContactActor> {
    const driverId = await dependencies.resolveDriverId(scope)
    if (driverId === null) throw new DriverNotRegisteredError()
    return { companyId: scope.companyId, correlationId, driverId, userId: scope.userId }
  }

  return [
    defineRoute<{ readonly correlationId: string; readonly documentId: string }>({
      async handle({ context, input }): Promise<Response> {
        const actor = await actorOf(context.scope, input.correlationId)
        const contacts = await dependencies.contacts.list({ actor, documentId: input.documentId })
        return jsonResponse({ body: { data: contacts.map(serialize) }, status: 200 })
      },
      method: 'GET',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
      }),
      pathname: CONTACTS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{
      readonly address: string
      readonly channel: DeliveryClientContactChannel
      readonly correlationId: string
      readonly documentId: string
      readonly label: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const actor = await actorOf(context.scope, input.correlationId)
        const result = await dependencies.contacts.add({
          actor,
          address: input.address,
          channel: input.channel,
          documentId: input.documentId,
          label: input.label,
        })
        return jsonResponse({
          body: { data: serialize(result.contact) },
          status: result.created ? 201 : 200,
        })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(CREATE_SCHEMA, request)
        return {
          address: body.address,
          channel: body.channel,
          correlationId,
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          label: body.label,
        }
      },
      pathname: CONTACTS_PATH,
      policy: REPORT_POLICY,
    }),
    defineRoute<{
      readonly address?: string
      readonly contactId: string
      readonly correlationId: string
      readonly documentId: string
      readonly label?: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const actor = await actorOf(context.scope, input.correlationId)
        const contact = await dependencies.contacts.update({
          actor,
          ...(input.address === undefined ? {} : { address: input.address }),
          contactId: input.contactId,
          documentId: input.documentId,
          ...(input.label === undefined ? {} : { label: input.label }),
        })
        return jsonResponse({ body: { data: serialize(contact) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseBody(UPDATE_SCHEMA, request)
        return {
          ...(body.address === undefined ? {} : { address: body.address }),
          contactId: parseUuidPathIdentifier(pathParameters.contactId ?? ''),
          correlationId,
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          ...(body.label === undefined ? {} : { label: body.label }),
        }
      },
      pathname: CONTACT_PATH,
      policy: REPORT_POLICY,
    }),
    defineRoute<{
      readonly contactId: string
      readonly correlationId: string
      readonly documentId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const actor = await actorOf(context.scope, input.correlationId)
        await dependencies.contacts.remove({
          actor,
          contactId: input.contactId,
          documentId: input.documentId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters }) => ({
        contactId: parseUuidPathIdentifier(pathParameters.contactId ?? ''),
        correlationId,
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
      }),
      pathname: CONTACT_PATH,
      policy: REPORT_POLICY,
    }),
  ]
}

function serialize(contact: DriverClientContact) {
  return {
    addressMasked: contact.addressMasked,
    channel: contact.channel,
    contactId: contact.contactId,
    editable: contact.editable,
    label: contact.label,
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
