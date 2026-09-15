/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ADDRESS_CORRECTION_MAIL_MAX_CONTACTS,
  activeAddressCorrectionMailContacts,
  addressCorrectionMailErrorMessageKey,
  buildAddressCorrectionMailRequestBody,
  canConfirmAddressCorrectionMail,
  initialAddressCorrectionMailContactIds,
} from '../../src/modules/nfe-workspace/shared/addressCorrectionMail.service'
import {
  mapAddressCorrectionMailContactList,
  mapAddressCorrectionMailContractor,
  mapAddressCorrectionMailSendResult,
  type AddressCorrectionMailContact,
} from '../../src/modules/nfe-workspace/shared/addressCorrectionMail.validation'
import { AddressCorrectionRequestError } from '../../src/modules/nfe-workspace/shared/addressCorrectionRequestError.service'
import { createNfeWorkspaceClient } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

const ACTIVE_SUBSCRIBED: AddressCorrectionMailContact = {
  email: 'financeiro@contratante.example',
  id: 'contact-1',
  receivesOccurrences: true,
  status: 'active',
}

const ACTIVE_NOT_SUBSCRIBED: AddressCorrectionMailContact = {
  email: 'operacao@contratante.example',
  id: 'contact-2',
  receivesOccurrences: false,
  status: 'active',
}

const INACTIVE_SUBSCRIBED: AddressCorrectionMailContact = {
  email: 'antigo@contratante.example',
  id: 'contact-3',
  receivesOccurrences: true,
  status: 'inactive',
}

describe('envio do pedido de correção por e-mail (spec 150, T305)', () => {
  test('sem requestIds monta o corpo completo', () => {
    expect(
      buildAddressCorrectionMailRequestBody({
        contactIds: ['contact-1'],
        contractorTaxId: '30290856000160',
      }),
    ).toEqual({ contactIds: ['contact-1'], contractorTaxId: '30290856000160' })
  })

  test('com requestIds monta o corpo unitário', () => {
    expect(
      buildAddressCorrectionMailRequestBody({
        contactIds: ['contact-1', 'contact-2'],
        contractorTaxId: '30290856000160',
        requestIds: ['request-1'],
      }),
    ).toEqual({
      contactIds: ['contact-1', 'contact-2'],
      contractorTaxId: '30290856000160',
      requestIds: ['request-1'],
    })
  })

  test('botão desabilitado com 0 contatos, habilitado até o teto, desabilitado acima dele', () => {
    expect(ADDRESS_CORRECTION_MAIL_MAX_CONTACTS).toBe(50)
    expect(canConfirmAddressCorrectionMail(0)).toBe(false)
    expect(canConfirmAddressCorrectionMail(1)).toBe(true)
    expect(canConfirmAddressCorrectionMail(50)).toBe(true)
    expect(canConfirmAddressCorrectionMail(51)).toBe(false)
  })

  test('só o contato ativo entra na lista marcável', () => {
    expect(
      activeAddressCorrectionMailContacts([
        ACTIVE_SUBSCRIBED,
        ACTIVE_NOT_SUBSCRIBED,
        INACTIVE_SUBSCRIBED,
      ]),
    ).toEqual([ACTIVE_SUBSCRIBED, ACTIVE_NOT_SUBSCRIBED])
  })

  test('seleção inicial: só o contato ativo que já recebe ocorrência', () => {
    expect(
      initialAddressCorrectionMailContactIds([
        ACTIVE_SUBSCRIBED,
        ACTIVE_NOT_SUBSCRIBED,
        INACTIVE_SUBSCRIBED,
      ]),
    ).toEqual(['contact-1'])
    expect(initialAddressCorrectionMailContactIds([ACTIVE_NOT_SUBSCRIBED])).toEqual([])
    expect(initialAddressCorrectionMailContactIds([])).toEqual([])
  })

  test('cada código estável do servidor tem uma mensagem própria, e o desconhecido cai na genérica', () => {
    expect(addressCorrectionMailErrorMessageKey('ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND')).toBe(
      'addressReport.correction.mail.error.contractorNotFound',
    )
    expect(addressCorrectionMailErrorMessageKey('CONTRACTOR_NOT_FOUND')).toBe(
      'addressReport.correction.mail.error.contractorNotFound',
    )
    expect(addressCorrectionMailErrorMessageKey('ADDRESS_CORRECTION_NOTHING_TO_SEND')).toBe(
      'addressReport.correction.mail.error.nothingToSend',
    )
    expect(addressCorrectionMailErrorMessageKey('ADDRESS_CORRECTION_NO_ACTIVE_CONTACT')).toBe(
      'addressReport.correction.mail.error.noActiveContact',
    )
    expect(addressCorrectionMailErrorMessageKey('ADDRESS_CORRECTION_REQUEST_NOT_SENDABLE')).toBe(
      'addressReport.correction.mail.error.requestNotSendable',
    )
    expect(addressCorrectionMailErrorMessageKey('CONTRACTOR_MAIL_NOT_CONFIGURED')).toBe(
      'addressReport.correction.mail.error.mailNotConfigured',
    )
    expect(addressCorrectionMailErrorMessageKey('IDEMPOTENCY_KEY_REUSED')).toBe(
      'addressReport.correction.mail.error.idempotencyReused',
    )
    expect(addressCorrectionMailErrorMessageKey('SOMETHING_ELSE')).toBe(
      'addressReport.correction.mail.error.generic',
    )
  })

  test('a lista de contatos ignora o registro que esta versão não reconhece', () => {
    expect(
      mapAddressCorrectionMailContactList({
        data: [
          {
            email: 'financeiro@contratante.example',
            id: 'contact-1',
            receivesOccurrences: true,
            status: 'active',
          },
          { email: 'sem-status@contratante.example', id: 'contact-4' },
        ],
      }),
    ).toEqual([ACTIVE_SUBSCRIBED])
    expect(mapAddressCorrectionMailContactList({})).toEqual([])
  })

  test('o contratante resolvido só precisa do id', () => {
    expect(mapAddressCorrectionMailContractor({ data: { id: 'contractor-1' } })).toBeNull()
    expect(mapAddressCorrectionMailContractor({ id: 'contractor-1', taxId: '123' })).toEqual({
      id: 'contractor-1',
    })
    expect(mapAddressCorrectionMailContractor({})).toBeNull()
  })

  test('o resultado do envio exige os quatro campos', () => {
    expect(
      mapAddressCorrectionMailSendResult({
        data: {
          messageId: 'message-1',
          recipientCount: 2,
          sentRequestIds: ['request-1', 'request-2'],
          threadId: 'thread-1',
        },
      }),
    ).toEqual({
      messageId: 'message-1',
      recipientCount: 2,
      sentRequestIds: ['request-1', 'request-2'],
      threadId: 'thread-1',
    })
    expect(mapAddressCorrectionMailSendResult({ data: { messageId: 'message-1' } })).toBeNull()
  })

  test('o client resolve o contratante pelo CNPJ e lista os contatos dele', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        if (request.url.endsWith('/contractors/by-tax-id/30290856000160')) {
          return Promise.resolve(
            Response.json({ data: { id: 'contractor-1', taxId: '30290856000160' } }),
          )
        }
        return Promise.resolve(
          Response.json({
            data: [
              {
                email: 'financeiro@contratante.example',
                id: 'contact-1',
                receivesOccurrences: true,
                status: 'active',
              },
            ],
          }),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const contractor = await client.getAddressCorrectionContractor({ taxId: '30290856000160' })
    expect(contractor).toEqual({ id: 'contractor-1' })
    const contacts = await client.listAddressCorrectionContacts({ contractorId: 'contractor-1' })
    expect(contacts).toEqual([ACTIVE_SUBSCRIBED])

    const [contractorRequest, contactsRequest] = requests
    if (contractorRequest === undefined || contactsRequest === undefined) {
      throw new Error('ADDRESS_CORRECTION_MAIL_CONTRACT_REQUEST_MISSING')
    }
    expect(contractorRequest.method).toBe('GET')
    expect(contactsRequest.url).toBe('https://api.example.test/contractors/contractor-1/contacts')
  })

  test('o client monta o POST com o header e o corpo unitário', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          Response.json(
            {
              data: {
                messageId: 'message-1',
                recipientCount: 1,
                sentRequestIds: ['request-1'],
                threadId: 'thread-1',
              },
            },
            { status: 202 },
          ),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const result = await client.sendAddressCorrectionMail({
      contactIds: ['contact-1'],
      contractorTaxId: '30290856000160',
      idempotencyKey: 'idempotency-key-0001',
      requestIds: ['request-1'],
    })

    const [request] = requests
    if (request === undefined) throw new Error('ADDRESS_CORRECTION_MAIL_CONTRACT_REQUEST_MISSING')
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.example.test/address-correction-requests/mail')
    expect(request.headers.get('idempotency-key')).toBe('idempotency-key-0001')
    expect(request.headers.get('authorization')).toBe('Bearer synthetic-access-token')
    expect(await request.clone().json()).toEqual({
      contactIds: ['contact-1'],
      contractorTaxId: '30290856000160',
      requestIds: ['request-1'],
    })
    expect(result).toEqual({
      messageId: 'message-1',
      recipientCount: 1,
      sentRequestIds: ['request-1'],
      threadId: 'thread-1',
    })
  })

  test('o client joga o erro com o código estável de um 409', async () => {
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          Response.json(
            {
              error: { code: 'ADDRESS_CORRECTION_NO_ACTIVE_CONTACT', message: 'No active contact' },
            },
            { status: 422 },
          ),
        ),
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    let caught: unknown
    try {
      await client.sendAddressCorrectionMail({
        contactIds: ['contact-1'],
        contractorTaxId: '30290856000160',
        idempotencyKey: 'idempotency-key-0001',
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AddressCorrectionRequestError)
    expect((caught as AddressCorrectionRequestError).message).toBe(
      'ADDRESS_CORRECTION_NO_ACTIVE_CONTACT',
    )
  })
})
