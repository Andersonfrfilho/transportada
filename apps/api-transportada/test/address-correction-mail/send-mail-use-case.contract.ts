/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * T304: caso de uso `send-address-correction-mail.use-case.ts` contra fakes em memória do
 * `AddressCorrectionMailTransactionPort`. O que estas fixam: envio completo e unitário, recusa de
 * `contactId` de outra contratante/inativo, `requestId` já enviado ou de outra contratante, nada a
 * enviar, idempotência (mesma chave devolve o mesmo resultado sem gravar de novo), e que o
 * `html`/`text` gravados vêm do mesmo `buildAddressCorrectionMail` usado pela T303.
 */
import { describe, expect, test } from 'bun:test'

import { createSendAddressCorrectionMailUseCase } from '../../src/address-correction/application/send-address-correction-mail.use-case.js'
import type {
  AddressCorrectionMailTransactionPort,
  RecordAddressCorrectionMailInput,
  SendAddressCorrectionMailResult,
} from '../../src/address-correction/application/address-correction-mail.port.js'
import type { AddressCorrectionRequest } from '../../src/address-correction/application/address-correction.port.js'
import { buildAddressCorrectionMail } from '../../src/address-correction/domain/address-correction-mail.template.js'
import {
  AddressCorrectionContractorNotFoundError,
  AddressCorrectionIdempotencyKeyReusedError,
  AddressCorrectionNoActiveContactError,
  AddressCorrectionNothingToSendError,
  AddressCorrectionRequestNotSendableError,
} from '../../src/address-correction/domain/address-correction.error.js'
import {
  ContractorMailNotConfiguredError,
  ContractorMailSendingNotVerifiedError,
} from '../../src/contractor-mail/domain/contractor-mail.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000c01'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c02'
const OTHER_CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c03'
const CONTRACTOR_TAX_ID = '11222333000181'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000c04'
const CONTACT_ACTIVE_ID = '00000000-0000-4000-8000-000000000c10'
const CONTACT_INACTIVE_ID = '00000000-0000-4000-8000-000000000c11'
const CONTACT_OTHER_CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c12'
const REQUEST_DRAFT_ID = '00000000-0000-4000-8000-000000000c20'
const REQUEST_SENT_ID = '00000000-0000-4000-8000-000000000c21'
const REQUEST_OTHER_CONTRACTOR_ID = '00000000-0000-4000-8000-000000000c22'
const REPLY_TOKEN_SECRET = '11'.repeat(32)
const SENDING_VERIFIED_AT = new Date('2026-09-15T12:00:00.000Z')

const PROPOSED_ADDRESS = {
  city: 'São Paulo',
  cityCode: '3550308',
  complement: null,
  district: 'Bela Vista',
  number: '45',
  postalCode: '01310100',
  state: 'SP',
  street: 'Avenida Paulista',
}

function buildDraft(input: {
  readonly contractorId?: string
  readonly id: string
  readonly status?: 'draft' | 'sent'
}): AddressCorrectionRequest & { readonly contractorId: string } {
  return {
    actorUserId: ACTOR_USER_ID,
    addressKey: '3550308|01310100|45',
    companyId: COMPANY_ID,
    contractorId: input.contractorId ?? CONTRACTOR_ID,
    createdAt: new Date('2026-09-15T12:00:00.000Z'),
    id: input.id,
    proposed: PROPOSED_ADDRESS,
    reasonDistanceMetres: '820.00',
    reasonMatchLevel: 'rooftop',
    recipientCount: null,
    recipientName: 'Cliente Final',
    reported: { ...PROPOSED_ADDRESS, street: 'Av Paulista' },
    sentAt: null,
    status: input.status ?? 'draft',
    threadId: null,
    updatedAt: new Date('2026-09-15T12:00:00.000Z'),
  }
}

type Calls = {
  readonly markRequestsSent: { readonly requestIds: readonly string[]; readonly threadId: string }[]
  readonly recordMail: RecordAddressCorrectionMailInput[]
  readonly saveIdempotency: { readonly idempotencyKey: string }[]
}

function createFakeTransaction(overrides: {
  readonly carrierName?: string
  readonly operatorName?: string
  readonly requests?: readonly (AddressCorrectionRequest & { readonly contractorId: string })[]
}): { readonly calls: Calls; readonly transaction: AddressCorrectionMailTransactionPort } {
  const requests = new Map(
    (
      overrides.requests ?? [
        buildDraft({ id: REQUEST_DRAFT_ID }),
        buildDraft({ id: REQUEST_SENT_ID, status: 'sent' }),
        buildDraft({ id: REQUEST_OTHER_CONTRACTOR_ID, contractorId: OTHER_CONTRACTOR_ID }),
      ]
    ).map((request) => [request.id, request]),
  )
  const contacts = new Map([
    [
      CONTACT_ACTIVE_ID,
      { contractorId: CONTRACTOR_ID, email: 'ativo@contratante.example', status: 'active' },
    ],
    [
      CONTACT_INACTIVE_ID,
      { contractorId: CONTRACTOR_ID, email: 'inativo@contratante.example', status: 'inactive' },
    ],
    [
      CONTACT_OTHER_CONTRACTOR_ID,
      { contractorId: OTHER_CONTRACTOR_ID, email: 'outra@contratante.example', status: 'active' },
    ],
  ])
  const idempotency = new Map<
    string,
    { fingerprint: string; response: SendAddressCorrectionMailResult }
  >()
  const calls: Calls = { markRequestsSent: [], recordMail: [], saveIdempotency: [] }

  const transaction: AddressCorrectionMailTransactionPort = {
    async findActiveContactsByIds({ contactIds, contractorId }) {
      return contactIds.flatMap((id) => {
        const contact = contacts.get(id)
        if (
          contact === undefined ||
          contact.status !== 'active' ||
          contact.contractorId !== contractorId
        ) {
          return []
        }
        return [{ email: contact.email, id }]
      })
    },
    async findCarrierName() {
      return overrides.carrierName
    },
    async findContractorByTaxId({ taxId }) {
      if (taxId !== CONTRACTOR_TAX_ID) return undefined
      return { displayName: 'Contratante Exemplo', id: CONTRACTOR_ID }
    },
    async findIdempotency({ idempotencyKey }) {
      return idempotency.get(idempotencyKey) ?? null
    },
    async findMailSettings() {
      return {
        id: 'settings-1',
        secretEnvelope: {},
        senderAddress: 'no-reply@transportada.test',
        sendingVerifiedAt: SENDING_VERIFIED_AT,
      }
    },
    async findOperatorName() {
      return overrides.operatorName
    },
    async findSendableRequests({ contractorId, requestIds }) {
      if (requestIds === undefined) {
        const sendable = [...requests.values()].filter(
          (request) => request.contractorId === contractorId && request.status === 'draft',
        )
        return { invalidRequestIds: [], sendable }
      }
      const sendable: AddressCorrectionRequest[] = []
      const invalidRequestIds: string[] = []
      for (const id of requestIds) {
        const request = requests.get(id)
        if (
          request === undefined ||
          request.contractorId !== contractorId ||
          request.status !== 'draft'
        ) {
          invalidRequestIds.push(id)
          continue
        }
        sendable.push(request)
      }
      return { invalidRequestIds, sendable }
    },
    async markRequestsSent({ requestIds, threadId }) {
      calls.markRequestsSent.push({ requestIds, threadId })
      for (const id of requestIds) {
        const request = requests.get(id)
        if (request !== undefined) requests.set(id, { ...request, status: 'sent', threadId })
      }
    },
    async recordMail(input) {
      calls.recordMail.push(input)
      return { messageId: `message-for-${input.threadId}` }
    },
    async saveIdempotency({ fingerprint, idempotencyKey, response }) {
      calls.saveIdempotency.push({ idempotencyKey })
      idempotency.set(idempotencyKey, { fingerprint, response })
    },
  }
  return { calls, transaction }
}

function createUseCase(fake: ReturnType<typeof createFakeTransaction>) {
  return createSendAddressCorrectionMailUseCase({
    fingerprintService: {
      async create({ fields }) {
        return fields.map((field) => Buffer.from(field).toString('hex')).join('|')
      },
    },
    secretService: {
      async decrypt() {
        return {
          apiKey: 'key',
          replyTokenSecret: REPLY_TOKEN_SECRET,
          webhookSigningSecret: 'whsec_x',
        }
      },
      async encrypt() {
        throw new Error('not used in this contract')
      },
    },
    unitOfWork: { execute: (operation) => operation(fake.transaction) },
  })
}

function baseInput(
  overrides: {
    readonly contactIds?: readonly string[]
    readonly idempotencyKey?: string
    readonly requestIds?: readonly string[] | undefined
  } = {},
) {
  return {
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    contactIds: overrides.contactIds ?? [CONTACT_ACTIVE_ID],
    contractorTaxId: CONTRACTOR_TAX_ID,
    correlationId: 'correlation-1',
    idempotencyKey: overrides.idempotencyKey ?? 'idempotency-1',
    requestIds: overrides.requestIds,
  }
}

describe('send address correction mail use case contract', () => {
  test('full send: mails every draft of the contractor and marks them sent', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    const result = await useCase.send(baseInput())

    expect(result.sentRequestIds).toEqual([REQUEST_DRAFT_ID])
    expect(result.recipientCount).toBe(1)
    expect(fake.calls.markRequestsSent).toEqual([
      { requestIds: [REQUEST_DRAFT_ID], threadId: result.threadId },
    ])
  })

  test('unitary/selection send: mails only the requested ids', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    const result = await useCase.send(baseInput({ requestIds: [REQUEST_DRAFT_ID] }))

    expect(result.sentRequestIds).toEqual([REQUEST_DRAFT_ID])
  })

  test('refuses a requestId that belongs to another contractor', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    await expect(
      useCase.send(baseInput({ requestIds: [REQUEST_OTHER_CONTRACTOR_ID] })),
    ).rejects.toBeInstanceOf(AddressCorrectionRequestNotSendableError)
    expect(fake.calls.recordMail).toEqual([])
  })

  test('refuses a requestId that was already sent', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    await expect(useCase.send(baseInput({ requestIds: [REQUEST_SENT_ID] }))).rejects.toBeInstanceOf(
      AddressCorrectionRequestNotSendableError,
    )
    expect(fake.calls.recordMail).toEqual([])
  })

  test('refuses an inactive contact', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    await expect(
      useCase.send(baseInput({ contactIds: [CONTACT_INACTIVE_ID] })),
    ).rejects.toBeInstanceOf(AddressCorrectionNoActiveContactError)
    expect(fake.calls.recordMail).toEqual([])
  })

  test('refuses a contact that belongs to another contractor', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    await expect(
      useCase.send(baseInput({ contactIds: [CONTACT_OTHER_CONTRACTOR_ID] })),
    ).rejects.toBeInstanceOf(AddressCorrectionNoActiveContactError)
    expect(fake.calls.recordMail).toEqual([])
  })

  test('refuses when the contractor has nothing to send', async () => {
    const fake = createFakeTransaction({ requests: [] })
    const useCase = createUseCase(fake)

    await expect(useCase.send(baseInput())).rejects.toBeInstanceOf(
      AddressCorrectionNothingToSendError,
    )
  })

  test('refuses an unregistered contractor tax id', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    await expect(
      useCase.send({ ...baseInput(), contractorTaxId: '00000000000000' }),
    ).rejects.toBeInstanceOf(AddressCorrectionContractorNotFoundError)
  })

  test('refuses when contractor mail is not configured', async () => {
    const fake = createFakeTransaction({})
    fake.transaction.findMailSettings = async () => undefined
    const useCase = createUseCase(fake)

    await expect(useCase.send(baseInput())).rejects.toBeInstanceOf(ContractorMailNotConfiguredError)
  })

  /** Spec 150 T401 (RF16): a ida e volta da 143 (`status`) não é mais exigida para enviar. */
  test('sends with the 143 round-trip still pending once the sender is verified', async () => {
    const fake = createFakeTransaction({})
    fake.transaction.findMailSettings = async () => ({
      id: 'settings-1',
      secretEnvelope: {},
      senderAddress: 'no-reply@transportada.test',
      sendingVerifiedAt: SENDING_VERIFIED_AT,
    })
    const useCase = createUseCase(fake)

    const result = await useCase.send(baseInput())

    expect(result.sentRequestIds).toEqual([REQUEST_DRAFT_ID])
    expect(fake.calls.recordMail).toHaveLength(1)
  })

  test('refuses with SENDING_NOT_VERIFIED while the sender is not verified', async () => {
    const fake = createFakeTransaction({})
    fake.transaction.findMailSettings = async () => ({
      id: 'settings-1',
      secretEnvelope: {},
      senderAddress: 'no-reply@transportada.test',
      sendingVerifiedAt: null,
    })
    const useCase = createUseCase(fake)

    await expect(useCase.send(baseInput())).rejects.toBeInstanceOf(
      ContractorMailSendingNotVerifiedError,
    )
    expect(fake.calls.recordMail).toEqual([])
  })

  test('idempotency: the same key replays the same result without recording a second message', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    const first = await useCase.send(baseInput({ idempotencyKey: 'replay-key' }))
    const second = await useCase.send(baseInput({ idempotencyKey: 'replay-key' }))

    expect(second).toEqual(first)
    expect(fake.calls.recordMail).toHaveLength(1)
    expect(fake.calls.saveIdempotency).toHaveLength(1)
  })

  test('idempotency: the same key with a different body is refused', async () => {
    const fake = createFakeTransaction({})
    const useCase = createUseCase(fake)

    await useCase.send(baseInput({ idempotencyKey: 'reused-key', requestIds: [REQUEST_DRAFT_ID] }))

    await expect(
      useCase.send(baseInput({ idempotencyKey: 'reused-key', requestIds: undefined })),
    ).rejects.toBeInstanceOf(AddressCorrectionIdempotencyKeyReusedError)
  })

  test('the recorded html and text come from buildAddressCorrectionMail', async () => {
    const fake = createFakeTransaction({
      carrierName: 'Transportadora Exemplo',
      operatorName: 'Maria Operadora',
    })
    const useCase = createUseCase(fake)

    await useCase.send(baseInput())

    const expected = buildAddressCorrectionMail({
      carrierName: 'Transportadora Exemplo',
      contractorName: 'Contratante Exemplo',
      items: [
        {
          proposed: PROPOSED_ADDRESS,
          reason: { distanceMetres: 820, matchLevel: 'rooftop' },
          recipientName: 'Cliente Final',
          reported: { ...PROPOSED_ADDRESS, street: 'Av Paulista' },
        },
      ],
      operatorName: 'Maria Operadora',
    })
    expect(fake.calls.recordMail[0]?.bodyHtml).toBe(expected.html)
    expect(fake.calls.recordMail[0]?.bodyText).toBe(expected.text)
    expect(fake.calls.recordMail[0]?.subject).toBe(expected.subject)
  })
})
