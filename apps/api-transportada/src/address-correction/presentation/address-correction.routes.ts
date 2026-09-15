/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `settings.manage` (RF7), a mesma permissão de `GET /address-report` — quem já vê a carteira
 * inteira de endereços a corrigir é quem também registra e envia o pedido de correção.
 */
import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_ADDRESS_CORRECTION_REQUESTS_MAIL_PATH,
  API_ADDRESS_CORRECTION_REQUESTS_PATH,
  API_ADDRESS_CORRECTION_REQUESTS_RECIPIENTS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { SendAddressCorrectionMailResult } from '../application/address-correction-mail.port.js'
import type { SendAddressCorrectionMailUseCase } from '../application/send-address-correction-mail.use-case.js'
import type {
  AddressCorrectionRecipients,
  FindAddressCorrectionRecipientsUseCase,
} from '../application/find-address-correction-recipients.use-case.js'
import type { SaveAddressCorrectionDraftUseCase } from '../application/save-address-correction-draft.use-case.js'
import type { ListAddressCorrectionRequestsUseCase } from '../application/list-address-correction-requests.use-case.js'
import type {
  AddressCorrectionRequest,
  AddressFields,
} from '../application/address-correction.port.js'
import {
  parseAddressCorrectionRequestKey,
  parsePostAddressCorrectionMailBody,
  parsePostAddressCorrectionRecipientsBody,
  parsePutAddressCorrectionRequestBody,
} from './address-correction-request.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const ADDRESS_CORRECTION_REQUEST_PATH = `${API_ADDRESS_CORRECTION_REQUESTS_PATH}/:addressKey`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = Readonly<{
  findRecipients: FindAddressCorrectionRecipientsUseCase
  listRequests: ListAddressCorrectionRequestsUseCase
  saveDraft: SaveAddressCorrectionDraftUseCase
  sendMail: SendAddressCorrectionMailUseCase
}>

type SaveDraftInput = Readonly<{
  addressKey: string
  proposed: AddressFields
}>

type SendMailInput = Readonly<{
  contactIds: readonly string[]
  contractorTaxId: string
  correlationId: string
  idempotencyKey: string
  requestIds: readonly string[] | undefined
}>

type RecipientsInput = Readonly<{ contractorTaxId: string }>

export function createAddressCorrectionRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute({
      async handle({ context }): Promise<Response> {
        const requests = await dependencies.listRequests.list({
          companyId: context.scope.companyId,
        })

        return jsonResponse({ data: requests.map(serializeAddressCorrectionRequest) })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: API_ADDRESS_CORRECTION_REQUESTS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SaveDraftInput>({
      async handle({ context, input }): Promise<Response> {
        const saved = await dependencies.saveDraft.save({
          actorUserId: context.scope.userId,
          addressKey: input.addressKey,
          companyId: context.scope.companyId,
          proposed: input.proposed,
        })

        return jsonResponse({ data: serializeAddressCorrectionRequest(saved) })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const body = await parsePutAddressCorrectionRequestBody(request)
        return {
          addressKey: parseAddressCorrectionRequestKey(pathParameters.addressKey ?? ''),
          proposed: body.proposed,
        }
      },
      /**
       * A chave carrega `|` (`cityCode|postalCode|number`) — sem `raw` o roteador recusaria o
       * caminho com 404 antes de a rota existir, como em `geocoded-addresses/:addressKey`.
       */
      pathParameterFormat: 'raw',
      pathname: ADDRESS_CORRECTION_REQUEST_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SendMailInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.sendMail.send({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          contactIds: input.contactIds,
          contractorTaxId: input.contractorTaxId,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
          requestIds: input.requestIds,
        })
        return jsonResponse({ data: serializeSendAddressCorrectionMailResult(result) }, 202)
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        const body = await parsePostAddressCorrectionMailBody(request)
        return {
          contactIds: body.contactIds,
          contractorTaxId: body.contractorTaxId,
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          requestIds: body.requestIds,
        }
      },
      pathname: API_ADDRESS_CORRECTION_REQUESTS_MAIL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<RecipientsInput>({
      async handle({ context, input }): Promise<Response> {
        const recipients = await dependencies.findRecipients.find({
          context: context.scope,
          contractorTaxId: input.contractorTaxId,
        })
        return jsonResponse({ data: serializeAddressCorrectionRecipients(recipients) })
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parsePostAddressCorrectionRecipientsBody(request)
        return { contractorTaxId: body.contractorTaxId }
      },
      pathname: API_ADDRESS_CORRECTION_REQUESTS_RECIPIENTS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status })
}

function serializeSendAddressCorrectionMailResult(result: SendAddressCorrectionMailResult): object {
  return {
    messageId: result.messageId,
    recipientCount: result.recipientCount,
    sentRequestIds: result.sentRequestIds,
    threadId: result.threadId,
  }
}

/** Nunca `companyId`: chave interna, não algo que a tela de confirmação precisa. */
function serializeAddressCorrectionRecipients(recipients: AddressCorrectionRecipients): object {
  return {
    contacts: recipients.contacts.map((contact) => ({
      canDecide: contact.canDecide,
      email: contact.email,
      id: contact.id,
      receivesOccurrences: contact.receivesOccurrences,
      status: contact.status,
    })),
    contractor: { displayName: recipients.contractor.displayName, id: recipients.contractor.id },
  }
}

/**
 * Nunca `companyId`, `contractorId` nem `actorUserId`: são chaves internas, não algo que a tela
 * precisa. RF8: nada de endereço/CEP em log, mas na resposta HTTP autenticada eles são o produto.
 */
function serializeAddressCorrectionRequest(request: AddressCorrectionRequest): object {
  return {
    addressKey: request.addressKey,
    id: request.id,
    proposed: request.proposed,
    reasonDistanceMetres: request.reasonDistanceMetres,
    reasonMatchLevel: request.reasonMatchLevel,
    recipientCount: request.recipientCount,
    recipientName: request.recipientName,
    reported: request.reported,
    sentAt: request.sentAt,
    status: request.status,
  }
}
