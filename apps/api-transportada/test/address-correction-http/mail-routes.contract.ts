/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `POST /address-correction-requests/mail` (spec 150, T304). O que estas fixam: permissão
 * `settings.manage`, `400` com `details[]` para corpo inválido, `Idempotency-Key` obrigatório, e os
 * códigos estáveis de cada recusa de negócio chegando com o status certo.
 */
import { describe, expect, test } from 'bun:test'

import {
  ADDRESS_CORRECTION_REQUEST,
  SEND_MAIL_RESULT,
  createAddressCorrectionHttpFixture,
} from '../fixtures/address-correction-http.fixture.js'
import {
  CORRELATION_ID,
  FRONTEND_ORIGIN,
  responseApiError,
} from '../fixtures/fleet-http-payload.fixture.js'
import { AddressCorrectionContractorNotFoundError } from '../../src/address-correction/domain/address-correction.error.js'
import { ContractorMailTemplateMissingError } from '../../src/contractor-mail/domain/contractor-mail.error.js'
import { ContractorMailTemplateNotUsableError } from '../../src/contractor-mail/domain/contractor-mail-template.error.js'

const MAIL_PATH = '/address-correction-requests/mail'
const CONTACT_ID = '00000000-0000-4000-8000-000000000b01'
const CONTRACTOR_TAX_ID = '11222333000181'

function mailRequest(input: {
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>>
}): Request {
  const headers = new Headers({
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
    ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(input.headers ?? {}),
  })
  return new Request(`${FRONTEND_ORIGIN}${MAIL_PATH}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    headers,
    method: 'POST',
  })
}

function validBody(): { readonly contactIds: readonly string[]; readonly contractorTaxId: string } {
  return { contactIds: [CONTACT_ID], contractorTaxId: CONTRACTOR_TAX_ID }
}

describe('POST /address-correction-requests/mail http contract', () => {
  test('sends the mail and answers 202 with the result', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(
      mailRequest({
        body: validBody(),
        headers: { 'idempotency-key': 'address-correction-mail-1' },
      }),
    )

    expect(response.status).toBe(202)
    const payload = (await response.json()) as { readonly data: unknown }
    expect(payload.data).toEqual({
      messageId: SEND_MAIL_RESULT.messageId,
      recipientCount: SEND_MAIL_RESULT.recipientCount,
      sentRequestIds: SEND_MAIL_RESULT.sentRequestIds,
      threadId: SEND_MAIL_RESULT.threadId,
    })
    expect(fixture.sendMailCalls).toHaveLength(1)
    expect(fixture.sendMailCalls[0]).toMatchObject({
      companyId: fixture.companyId,
      contactIds: [CONTACT_ID],
      contractorTaxId: CONTRACTOR_TAX_ID,
      idempotencyKey: 'address-correction-mail-1',
      requestIds: undefined,
    })
  })

  test('passes requestIds through for the unitary/selection send', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(
      mailRequest({
        body: { ...validBody(), requestIds: [ADDRESS_CORRECTION_REQUEST.id] },
        headers: { 'idempotency-key': 'address-correction-mail-2' },
      }),
    )

    expect(response.status).toBe(202)
    expect(fixture.sendMailCalls[0]?.requestIds).toEqual([ADDRESS_CORRECTION_REQUEST.id])
  })

  /** Spec 150 T402 (RF15): o modelo escolhido na confirmação chega ao caso de uso. */
  test('passes templateId through when the operator picks a template', async () => {
    const fixture = await createAddressCorrectionHttpFixture()
    const templateId = '00000000-0000-4000-8000-000000000b30'

    const response = await fixture.handle(
      mailRequest({
        body: { ...validBody(), templateId },
        headers: { 'idempotency-key': 'address-correction-mail-template-1' },
      }),
    )

    expect(response.status).toBe(202)
    expect(fixture.sendMailCalls[0]?.templateId).toBe(templateId)
  })

  test('refuses a templateId that is not a uuid, with details', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(
      mailRequest({
        body: { ...validBody(), templateId: 'padrao' },
        headers: { 'idempotency-key': 'address-correction-mail-template-2' },
      }),
    )

    expect(response.status).toBe(400)
    const error = await responseApiError(response)
    expect(error.details ?? []).toContainEqual(expect.objectContaining({ field: 'templateId' }))
    expect(fixture.sendMailCalls).toEqual([])
  })

  test('propagates TEMPLATE_MISSING and TEMPLATE_NOT_USABLE with their stable codes', async () => {
    for (const [error, code] of [
      [new ContractorMailTemplateMissingError(), 'CONTRACTOR_MAIL_TEMPLATE_MISSING'],
      [new ContractorMailTemplateNotUsableError(), 'CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE'],
    ] as const) {
      const fixture = await createAddressCorrectionHttpFixture({ sendMailError: error })

      const response = await fixture.handle(
        mailRequest({
          body: validBody(),
          headers: { 'idempotency-key': `address-correction-mail-${code}` },
        }),
      )

      expect(response.status).toBe(409)
      expect(await responseApiError(response)).toMatchObject({ code })
    }
  })

  test('requires the Idempotency-Key header', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(mailRequest({ body: validBody() }))

    expect(response.status).toBe(400)
    expect(fixture.sendMailCalls).toEqual([])
  })

  test('refuses a body without at least one contactId', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(
      mailRequest({
        body: { contactIds: [], contractorTaxId: CONTRACTOR_TAX_ID },
        headers: { 'idempotency-key': 'address-correction-mail-3' },
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.sendMailCalls).toEqual([])
  })

  test('refuses a body with repeated contactIds, with details', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(
      mailRequest({
        body: { contactIds: [CONTACT_ID, CONTACT_ID], contractorTaxId: CONTRACTOR_TAX_ID },
        headers: { 'idempotency-key': 'address-correction-mail-4' },
      }),
    )

    expect(response.status).toBe(400)
    const error = await responseApiError(response)
    expect(error.details ?? []).not.toEqual([])
    expect(fixture.sendMailCalls).toEqual([])
  })

  test('refuses more than the recipient cap of contactIds', async () => {
    const fixture = await createAddressCorrectionHttpFixture()
    const contactIds = Array.from({ length: 51 }, () => crypto.randomUUID())

    const response = await fixture.handle(
      mailRequest({
        body: { contactIds, contractorTaxId: CONTRACTOR_TAX_ID },
        headers: { 'idempotency-key': 'address-correction-mail-5' },
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.sendMailCalls).toEqual([])
  })

  test('propagates the stable code when the contractor is not registered', async () => {
    const fixture = await createAddressCorrectionHttpFixture({
      sendMailError: new AddressCorrectionContractorNotFoundError(),
    })

    const response = await fixture.handle(
      mailRequest({
        body: validBody(),
        headers: { 'idempotency-key': 'address-correction-mail-6' },
      }),
    )

    expect(response.status).toBe(404)
    expect(await responseApiError(response)).toMatchObject({
      code: 'ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND',
    })
  })

  test('rejects a caller without settings.manage', async () => {
    const fixture = await createAddressCorrectionHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(
      mailRequest({
        body: validBody(),
        headers: { 'idempotency-key': 'address-correction-mail-7' },
      }),
    )

    expect(response.status).toBe(403)
    expect(fixture.sendMailCalls).toEqual([])
  })

  test('never lets the answer be cached', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(
      mailRequest({
        body: validBody(),
        headers: { 'idempotency-key': 'address-correction-mail-8' },
      }),
    )

    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  /** RF8: nenhum e-mail, endereço, CEP ou CNPJ do corpo aparece em log, nem no caminho de sucesso. */
  test('never logs the recipient email, the address or the contractor tax id', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    await fixture.handle(
      mailRequest({
        body: validBody(),
        headers: { 'idempotency-key': 'address-correction-mail-9' },
      }),
    )
    await fixture.handle(
      mailRequest({
        body: { contactIds: [], contractorTaxId: CONTRACTOR_TAX_ID },
        headers: { 'idempotency-key': 'address-correction-mail-10' },
      }),
    )

    const serialized = JSON.stringify(fixture.logCalls)
    expect(serialized).not.toContain(CONTACT_ID)
    expect(serialized).not.toContain(CONTRACTOR_TAX_ID)
  })
})
