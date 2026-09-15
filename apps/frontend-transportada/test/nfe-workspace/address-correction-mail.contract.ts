/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ADDRESS_CORRECTION_MAIL_MAX_CONTACTS,
  activeAddressCorrectionMailContacts,
  activeAddressCorrectionMailTemplates,
  addressCorrectionMailErrorHasConfigurationShortcut,
  addressCorrectionMailErrorMessageKey,
  addressCorrectionMailTemplateIdForRequest,
  buildAddressCorrectionMailRequestBody,
  canConfirmAddressCorrectionMail,
  defaultAddressCorrectionMailTemplateId,
  initialAddressCorrectionMailContactIds,
  initialAddressCorrectionMailTemplateId,
  resolveAddressCorrectionMailIdempotencyKey,
} from '../../src/modules/nfe-workspace/shared/addressCorrectionMail.service'
import {
  mapAddressCorrectionMailContactList,
  mapAddressCorrectionMailContractor,
  mapAddressCorrectionMailSendResult,
  mapAddressCorrectionMailTemplateList,
  mapAddressCorrectionMailTemplatePreview,
  type AddressCorrectionMailContact,
  type AddressCorrectionMailTemplate,
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

const DEFAULT_TEMPLATE: AddressCorrectionMailTemplate = {
  id: 'template-default',
  isDefault: true,
  name: 'Modelo padrão',
  status: 'active',
}

const OTHER_ACTIVE_TEMPLATE: AddressCorrectionMailTemplate = {
  id: 'template-other',
  isDefault: false,
  name: 'Modelo alternativo',
  status: 'active',
}

const ARCHIVED_TEMPLATE: AddressCorrectionMailTemplate = {
  id: 'template-archived',
  isDefault: false,
  name: 'Modelo arquivado',
  status: 'archived',
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

  test('com templateId monta o corpo com o modelo escolhido (T405)', () => {
    expect(
      buildAddressCorrectionMailRequestBody({
        contactIds: ['contact-1'],
        contractorTaxId: '30290856000160',
        templateId: 'template-other',
      }),
    ).toEqual({
      contactIds: ['contact-1'],
      contractorTaxId: '30290856000160',
      templateId: 'template-other',
    })
  })

  test('botão desabilitado com 0 contatos, habilitado até o teto, desabilitado acima dele ou sem modelo', () => {
    expect(ADDRESS_CORRECTION_MAIL_MAX_CONTACTS).toBe(50)
    expect(canConfirmAddressCorrectionMail(0, true)).toBe(false)
    expect(canConfirmAddressCorrectionMail(1, true)).toBe(true)
    expect(canConfirmAddressCorrectionMail(50, true)).toBe(true)
    expect(canConfirmAddressCorrectionMail(51, true)).toBe(false)
    expect(canConfirmAddressCorrectionMail(1, false)).toBe(false)
  })

  test('arquivado nunca entra na lista de modelos do seletor (RF15)', () => {
    expect(
      activeAddressCorrectionMailTemplates([
        DEFAULT_TEMPLATE,
        OTHER_ACTIVE_TEMPLATE,
        ARCHIVED_TEMPLATE,
      ]),
    ).toEqual([DEFAULT_TEMPLATE, OTHER_ACTIVE_TEMPLATE])
  })

  test('seleção inicial do modelo: o padrão quando existe, o primeiro ativo quando não há padrão, nenhum sem modelo ativo', () => {
    expect(initialAddressCorrectionMailTemplateId([OTHER_ACTIVE_TEMPLATE, DEFAULT_TEMPLATE])).toBe(
      'template-default',
    )
    expect(initialAddressCorrectionMailTemplateId([OTHER_ACTIVE_TEMPLATE])).toBe('template-other')
    expect(initialAddressCorrectionMailTemplateId([ARCHIVED_TEMPLATE])).toBeNull()
    expect(initialAddressCorrectionMailTemplateId([])).toBeNull()
  })

  test('o modelo marcado como padrão é achado mesmo fora da primeira posição', () => {
    expect(defaultAddressCorrectionMailTemplateId([OTHER_ACTIVE_TEMPLATE, DEFAULT_TEMPLATE])).toBe(
      'template-default',
    )
    expect(defaultAddressCorrectionMailTemplateId([OTHER_ACTIVE_TEMPLATE])).toBeNull()
  })

  test('o templateId só viaja no corpo quando difere do padrão do servidor (T402)', () => {
    expect(
      addressCorrectionMailTemplateIdForRequest({
        defaultTemplateId: 'template-default',
        selectedTemplateId: 'template-default',
      }),
    ).toBeUndefined()
    expect(
      addressCorrectionMailTemplateIdForRequest({
        defaultTemplateId: 'template-default',
        selectedTemplateId: 'template-other',
      }),
    ).toBe('template-other')
    expect(
      addressCorrectionMailTemplateIdForRequest({
        defaultTemplateId: null,
        selectedTemplateId: null,
      }),
    ).toBeUndefined()
    // Sem padrão marcado, o servidor não resolve modelo sozinho — o id explícito sempre viaja.
    expect(
      addressCorrectionMailTemplateIdForRequest({
        defaultTemplateId: null,
        selectedTemplateId: 'template-other',
      }),
    ).toBe('template-other')
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
    expect(addressCorrectionMailErrorMessageKey('CONTRACTOR_MAIL_SENDING_NOT_VERIFIED')).toBe(
      'addressReport.correction.mail.error.sendingNotVerified',
    )
    expect(addressCorrectionMailErrorMessageKey('CONTRACTOR_MAIL_TEMPLATE_MISSING')).toBe(
      'addressReport.correction.mail.error.templateMissing',
    )
    expect(addressCorrectionMailErrorMessageKey('CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE')).toBe(
      'addressReport.correction.mail.error.templateNotUsable',
    )
    expect(addressCorrectionMailErrorMessageKey('IDEMPOTENCY_KEY_REUSED')).toBe(
      'addressReport.correction.mail.error.idempotencyReused',
    )
    expect(addressCorrectionMailErrorMessageKey('SOMETHING_ELSE')).toBe(
      'addressReport.correction.mail.error.generic',
    )
  })

  test('os quatro motivos de liberação (RF16/RF17) levam ao atalho de configuração, o resto não', () => {
    expect(
      addressCorrectionMailErrorHasConfigurationShortcut('CONTRACTOR_MAIL_NOT_CONFIGURED'),
    ).toBe(true)
    expect(
      addressCorrectionMailErrorHasConfigurationShortcut('CONTRACTOR_MAIL_SENDING_NOT_VERIFIED'),
    ).toBe(true)
    expect(
      addressCorrectionMailErrorHasConfigurationShortcut('CONTRACTOR_MAIL_TEMPLATE_MISSING'),
    ).toBe(true)
    expect(
      addressCorrectionMailErrorHasConfigurationShortcut('CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE'),
    ).toBe(true)
    expect(addressCorrectionMailErrorHasConfigurationShortcut('IDEMPOTENCY_KEY_REUSED')).toBe(false)
    expect(
      addressCorrectionMailErrorHasConfigurationShortcut('ADDRESS_CORRECTION_NO_ACTIVE_CONTACT'),
    ).toBe(false)
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

  test('a lista de modelos ignora o registro que esta versão não reconhece', () => {
    expect(
      mapAddressCorrectionMailTemplateList({
        data: [
          { id: 'template-default', isDefault: true, name: 'Padrão', status: 'active' },
          { id: 'template-sem-status', isDefault: false, name: 'Sem status' },
        ],
      }),
    ).toEqual([{ id: 'template-default', isDefault: true, name: 'Padrão', status: 'active' }])
    expect(mapAddressCorrectionMailTemplateList({})).toEqual([])
  })

  test('a prévia exige os três campos', () => {
    expect(
      mapAddressCorrectionMailTemplatePreview({
        data: { html: '<p>Olá</p>', subject: 'Correção de endereço', text: 'Olá' },
      }),
    ).toEqual({ html: '<p>Olá</p>', subject: 'Correção de endereço', text: 'Olá' })
    expect(
      mapAddressCorrectionMailTemplatePreview({ data: { subject: 'Só o assunto' } }),
    ).toBeNull()
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

  /**
   * Revisão final, item de segurança B3: o CNPJ vai no corpo do `POST`, nunca no caminho da URL —
   * substitui `GET /contractors/by-tax-id/:taxId` + `GET /contractors/:id/contacts`.
   */
  test('o client resolve o contratante e os contatos ativos num POST só, com o CNPJ no corpo', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          Response.json({
            data: {
              contacts: [
                {
                  email: 'financeiro@contratante.example',
                  id: 'contact-1',
                  receivesOccurrences: true,
                  status: 'active',
                },
              ],
              contractor: { id: 'contractor-1' },
            },
          }),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const recipients = await client.findAddressCorrectionRecipients({
      contractorTaxId: '30290856000160',
    })
    expect(recipients.contractor).toEqual({ id: 'contractor-1' })
    expect(recipients.contacts).toEqual([ACTIVE_SUBSCRIBED])

    const [request] = requests
    if (request === undefined) throw new Error('ADDRESS_CORRECTION_MAIL_CONTRACT_REQUEST_MISSING')
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.example.test/address-correction-requests/recipients')
    expect(request.url).not.toContain('30290856000160')
    expect(await request.clone().json()).toEqual({ contractorTaxId: '30290856000160' })
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

  test('o client monta o POST com o corpo levando o templateId escolhido (T405)', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          Response.json({
            data: {
              messageId: 'message-1',
              recipientCount: 1,
              sentRequestIds: ['request-1'],
              threadId: 'thread-1',
            },
          }),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    await client.sendAddressCorrectionMail({
      contactIds: ['contact-1'],
      contractorTaxId: '30290856000160',
      idempotencyKey: 'idempotency-key-0001',
      templateId: 'template-other',
    })

    const [request] = requests
    if (request === undefined) throw new Error('ADDRESS_CORRECTION_MAIL_CONTRACT_REQUEST_MISSING')
    expect(await request.clone().json()).toEqual({
      contactIds: ['contact-1'],
      contractorTaxId: '30290856000160',
      templateId: 'template-other',
    })
  })

  test('o client lista os modelos ativos e arquivados do tipo pelo GET filtrado', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          Response.json({
            data: [{ id: 'template-default', isDefault: true, name: 'Padrão', status: 'active' }],
          }),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const templates = await client.listAddressCorrectionMailTemplates()
    expect(templates).toEqual([
      { id: 'template-default', isDefault: true, name: 'Padrão', status: 'active' },
    ])

    const [request] = requests
    if (request === undefined) throw new Error('ADDRESS_CORRECTION_MAIL_CONTRACT_REQUEST_MISSING')
    expect(request.method).toBe('GET')
    expect(request.url).toBe(
      'https://api.example.test/contractor-mail-templates?mailType=address_correction',
    )
  })

  test('o client pede a prévia por templateId', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          Response.json({ data: { html: '<p>Olá</p>', subject: 'Assunto', text: 'Olá' } }),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const preview = await client.previewAddressCorrectionMailTemplate({
      templateId: 'template-default',
    })
    expect(preview).toEqual({ html: '<p>Olá</p>', subject: 'Assunto', text: 'Olá' })

    const [request] = requests
    if (request === undefined) throw new Error('ADDRESS_CORRECTION_MAIL_CONTRACT_REQUEST_MISSING')
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.example.test/contractor-mail-templates/preview')
    expect(await request.clone().json()).toEqual({ templateId: 'template-default' })
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

/**
 * Revisão final, item [BAIXO]: a `Idempotency-Key` precisa mudar quando a seleção de contatos
 * muda — do contrário um reenvio depois de marcar/desmarcar um contato reusaria a chave com um
 * corpo diferente, e o servidor recusa isso com `IDEMPOTENCY_KEY_REUSED` (409). Regra extraída
 * para função pura porque o hook (`useAddressCorrectionMailDialog.hook.ts`) não tem infraestrutura
 * de teste de hook neste repo (sem `renderHook`/`@testing-library/react`).
 */
describe('chave de idempotência do envio (spec 150, revisão final / T405)', () => {
  test('estável entre retries com a mesma seleção, em qualquer ordem, e o mesmo modelo', () => {
    const generateKey = () => 'should-not-be-called'
    const resolved = resolveAddressCorrectionMailIdempotencyKey({
      currentContactIds: ['contact-2', 'contact-1'],
      currentTemplateId: null,
      generateKey,
      previousContactIds: ['contact-1', 'contact-2'],
      previousIdempotencyKey: 'key-from-open',
      previousTemplateId: null,
    })
    expect(resolved.idempotencyKey).toBe('key-from-open')
  })

  test('nova chave ao reabrir (sem seleção anterior)', () => {
    const resolved = resolveAddressCorrectionMailIdempotencyKey({
      currentContactIds: ['contact-1'],
      currentTemplateId: null,
      generateKey: () => 'fresh-key-on-open',
      previousContactIds: null,
      previousIdempotencyKey: 'stale-key-from-last-session',
      previousTemplateId: null,
    })
    expect(resolved.idempotencyKey).toBe('fresh-key-on-open')
  })

  test('nova chave quando a seleção de contatos muda', () => {
    const resolved = resolveAddressCorrectionMailIdempotencyKey({
      currentContactIds: ['contact-1', 'contact-2'],
      currentTemplateId: null,
      generateKey: () => 'fresh-key-on-change',
      previousContactIds: ['contact-1'],
      previousIdempotencyKey: 'key-from-open',
      previousTemplateId: null,
    })
    expect(resolved.idempotencyKey).toBe('fresh-key-on-change')
    expect(resolved.contactIds).toEqual(['contact-1', 'contact-2'])
  })

  test('nova chave quando o modelo escolhido muda, mesmo com os contatos iguais (T405)', () => {
    const resolved = resolveAddressCorrectionMailIdempotencyKey({
      currentContactIds: ['contact-1'],
      currentTemplateId: 'template-other',
      generateKey: () => 'fresh-key-on-template-change',
      previousContactIds: ['contact-1'],
      previousIdempotencyKey: 'key-from-open',
      previousTemplateId: null,
    })
    expect(resolved.idempotencyKey).toBe('fresh-key-on-template-change')
    expect(resolved.templateId).toBe('template-other')
  })

  test('a mesma seleção e o mesmo modelo não trocam a chave', () => {
    const generateKey = () => 'should-not-be-called'
    const resolved = resolveAddressCorrectionMailIdempotencyKey({
      currentContactIds: ['contact-1'],
      currentTemplateId: 'template-other',
      generateKey,
      previousContactIds: ['contact-1'],
      previousIdempotencyKey: 'key-from-open',
      previousTemplateId: 'template-other',
    })
    expect(resolved.idempotencyKey).toBe('key-from-open')
  })
})
