/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T301 (spec 143 T013): os contatos de e-mail da contratante, dentro de `/contractors/:id`
 * — mesma permissão de `GET /address-report` (RF7 da spec 150): `settings.manage`. Sem `DELETE`
 * físico: desativar é `PATCH` com `status: 'inactive'`, porque a trilha de mensagens
 * (`contractor_mail_messages`) aponta para o contato.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_CONTRACTOR_CONTACTS_PATH,
  API_CONTRACTOR_CONTACT_PATH,
} from '../../shared/api.constant.js'
import { CONTRACTOR_CONTACT_STATUSES } from '../../database/contractor-mail.schema.js'
import type {
  ContractorContact,
  CreateContractorContactUseCaseInput,
  UpdateContractorContactUseCaseInput,
} from '../application/contractor-contacts.use-case.js'

const CONTACTS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': 'application/json' }

const createContactSchema = z
  .object({
    canDecide: z.boolean().default(false),
    email: z.string().trim().email(),
    receivesOccurrences: z.boolean().default(true),
  })
  .strict()

const updateContactSchema = z
  .object({
    canDecide: z.boolean().optional(),
    email: z.string().trim().email().optional(),
    receivesOccurrences: z.boolean().optional(),
    status: z.enum(CONTRACTOR_CONTACT_STATUSES).optional(),
  })
  .strict()

type ListInput = { readonly contractorId: string }
type CreateInput = Omit<CreateContractorContactUseCaseInput, 'context'>
type UpdateInput = Omit<UpdateContractorContactUseCaseInput, 'context'>

export type ContractorContactRoutesDependencies = {
  readonly createContact: {
    execute(input: CreateContractorContactUseCaseInput): Promise<ContractorContact>
  }
  readonly listContacts: {
    execute(input: {
      readonly context: CompanyContext
      readonly contractorId: string
    }): Promise<readonly ContractorContact[]>
  }
  readonly updateContact: {
    execute(input: UpdateContractorContactUseCaseInput): Promise<ContractorContact>
  }
}

export function createContractorContactRoutes(
  dependencies: ContractorContactRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ListInput>({
      async handle({ context, input }): Promise<Response> {
        const contacts = await dependencies.listContacts.execute({
          context: context.scope,
          contractorId: input.contractorId,
        })
        return jsonResponse({ body: { data: contacts.map(serializeContact) } })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: API_CONTRACTOR_CONTACTS_PATH,
      policy: CONTACTS_MANAGE_POLICY,
    }),
    defineRoute<CreateInput>({
      async handle({ context, input }): Promise<Response> {
        const contact = await dependencies.createContact.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeContact(contact) }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(createContactSchema, request)
        return {
          canDecide: body.canDecide,
          contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          email: body.email,
          receivesOccurrences: body.receivesOccurrences,
        }
      },
      pathname: API_CONTRACTOR_CONTACTS_PATH,
      policy: CONTACTS_MANAGE_POLICY,
    }),
    defineRoute<UpdateInput>({
      async handle({ context, input }): Promise<Response> {
        const contact = await dependencies.updateContact.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeContact(contact) } })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        const body = await parseBody(updateContactSchema, request)
        return {
          ...withoutUndefined(body),
          contactId: parseUuidPathIdentifier(pathParameters.contactId ?? ''),
          contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        } as UpdateInput
      },
      pathname: API_CONTRACTOR_CONTACT_PATH,
      policy: CONTACTS_MANAGE_POLICY,
    }),
  ]
}

/** `exactOptionalPropertyTypes`: chave ausente e chave com `undefined` dizem coisas diferentes. */
function withoutUndefined(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
}

/** Lista fechada de campos — um campo novo no agregado só vaza se alguém o acrescentar aqui. */
function serializeContact(contact: ContractorContact): Record<string, unknown> {
  return {
    canDecide: contact.canDecide,
    contractorId: contact.contractorId,
    email: contact.email,
    id: contact.id,
    receivesOccurrences: contact.receivesOccurrences,
    status: contact.status,
  }
}

function jsonResponse(input: { readonly body: unknown; readonly status?: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: NO_STORE_HEADERS,
    status: input.status ?? 200,
  })
}
