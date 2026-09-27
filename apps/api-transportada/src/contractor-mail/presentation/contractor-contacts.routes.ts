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
import {
  CONTRACTOR_CONTACT_CHANNELS,
  CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
  CONTRACTOR_CONTACT_STATUSES,
  CONTRACTOR_CONTACT_TYPES,
} from '../../database/contractor-mail.schema.js'
import type {
  ContractorContact,
  CreateContractorContactUseCaseInput,
  UpdateContractorContactUseCaseInput,
} from '../application/contractor-contacts.use-case.js'

const CONTACTS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': 'application/json' }
/** RFC 5321 §4.5.3.1.3 — mesmo teto do CHECK `contractor_contacts_email_length_check` no banco. */
const EMAIL_MAX_LENGTH = 254

/** Nome e setor são texto de gente: teto largo, e o banco não tem outro limite para eles. */
const LABEL_MAX_LENGTH = 120
/** Telefone digitado, com máscara; a política normaliza e confere o formato do WhatsApp. */
const TYPED_PHONE_MAX_LENGTH = 32

/**
 * Spec 183 T302 (RF5, D6): os campos novos. `.strict()` segue valendo — em especial, o aceite do
 * WhatsApp chega como `whatsappOptIn: boolean`, e o carimbo (`whatsappOptInAt`/`ByUserId`) é do
 * servidor: mandá-lo no corpo é 400.
 */
const contactChannelFields = {
  name: z.string().max(LABEL_MAX_LENGTH).optional(),
  occurrenceStages: z.array(z.enum(CONTRACTOR_CONTACT_OCCURRENCE_STAGES)).max(3).optional(),
  phone: z.string().max(TYPED_PHONE_MAX_LENGTH).nullable().optional(),
  preferredChannel: z.enum(CONTRACTOR_CONTACT_CHANNELS).optional(),
  roleLabel: z.string().max(LABEL_MAX_LENGTH).optional(),
  types: z.array(z.enum(CONTRACTOR_CONTACT_TYPES)).max(CONTRACTOR_CONTACT_TYPES.length).optional(),
  whatsappOptIn: z.boolean().optional(),
}

/**
 * Os dois campos antigos seguem aceitos (o formulário anterior à 183) e sem padrão aqui: quem decide
 * o padrão do contato novo é a política, e ela precisa saber se vieram ou não.
 */
const createContactSchema = z
  .object({
    ...contactChannelFields,
    canDecide: z.boolean().optional(),
    email: z.string().trim().max(EMAIL_MAX_LENGTH).email(),
    receivesOccurrences: z.boolean().optional(),
  })
  .strict()

const updateContactSchema = z
  .object({
    ...contactChannelFields,
    canDecide: z.boolean().optional(),
    email: z.string().trim().max(EMAIL_MAX_LENGTH).email().optional(),
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
          ...withoutUndefined(body),
          contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          email: body.email,
        } as CreateInput
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
    name: contact.name,
    occurrenceStages: contact.occurrenceStages,
    phone: contact.phone,
    preferredChannel: contact.preferredChannel,
    receivesOccurrences: contact.receivesOccurrences,
    roleLabel: contact.roleLabel,
    status: contact.status,
    types: contact.types,
    whatsappOptInAt: contact.whatsappOptInAt?.toISOString() ?? null,
    whatsappOptInByUserId: contact.whatsappOptInByUserId,
  }
}

function jsonResponse(input: { readonly body: unknown; readonly status?: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: NO_STORE_HEADERS,
    status: input.status ?? 200,
  })
}
