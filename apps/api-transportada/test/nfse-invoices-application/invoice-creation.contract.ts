/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  NFSE_ISSUE_EVENT_NAME,
  NFSE_ISSUE_OUTBOX_EVENT,
  createInvoiceFingerprint,
} from '../../src/nfse-invoices/application/nfse-issuance-attempt.service'
import { createNfseInvoiceUseCase } from '../../src/nfse-invoices/application/nfse-invoice.use-case'
import {
  ATTEMPT_ID,
  COMPANY_ID,
  CONTEXT,
  CREDENTIAL_ID,
  DOCUMENT_ID,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  NOW,
  OTHER_DOCUMENT_ID,
  PROFILE,
  PROFILE_ID,
  RULE_VERSION_ID,
  USER_ID,
  createNfseRepositoryFixture,
  selectionDocument,
} from '../fixtures/nfse-invoices-application.fixture'

const CORRELATION_ID = 'nfse-invoice-creation-correlation'

function createUseCase(overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {}) {
  const fixture = createNfseRepositoryFixture(overrides)
  return {
    ...fixture,
    useCase: createNfseInvoiceUseCase({ now: () => new Date(NOW), repository: fixture.repository }),
  }
}

const CREATE_INPUT = {
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  documentIds: [DOCUMENT_ID],
  idempotencyKey: IDEMPOTENCY_KEY,
  profileId: PROFILE_ID,
} as const

describe('nfse invoice creation', () => {
  test('a criação roda dentro da transação da empresa do contexto', async () => {
    const { recording, useCase } = createUseCase()

    const summary = await useCase.create(CREATE_INPUT)

    expect(recording.transactionScopes).toEqual([COMPANY_ID])
    expect(summary.invoiceId).toBe(INVOICE_ID)
    expect(summary.attemptId).toBe(ATTEMPT_ID)
    expect(summary.replayed).toBe(false)
    expect(summary.requestedAt).toBe(NOW)
  })

  /**
   * A ordem é contrato: vínculo e encargo precisam existir antes da tentativa, e o outbox é o
   * último — publicar antes de gravar o payload deixaria o worker ler uma nota pela metade.
   */
  test('vínculos, encargos, payload, evento e outbox saem na mesma transação e nessa ordem', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    expect(recording.steps).toEqual([
      'createInvoice',
      'linkDocuments',
      'createCharges',
      'createAttempt',
      'savePayload',
      'appendEvent',
      'pushOutbox',
    ])
  })

  test('os documentos entram vinculados à nota criada', async () => {
    const { recording, useCase } = createUseCase({
      documents: [
        selectionDocument(),
        selectionDocument({ documentId: OTHER_DOCUMENT_ID, number: '000000124' }),
      ],
    })

    const summary = await useCase.create({
      ...CREATE_INPUT,
      documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
    })

    expect(recording.links[0]?.invoiceId).toBe(INVOICE_ID)
    expect(recording.links[0]?.documentIds).toEqual([DOCUMENT_ID, OTHER_DOCUMENT_ID])
    expect(summary.documentIds).toEqual([DOCUMENT_ID, OTHER_DOCUMENT_ID])
  })

  test('o encargo do frete é gravado com a base e a alíquota da regra congelada', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    expect(recording.charges[0]?.charges).toEqual([
      {
        amount: '850.0000',
        baseAmount: '10000.0000',
        calculationType: 'percentage_of_cargo',
        label: 'Frete',
        rate: '0.085000',
      },
    ])
  })

  /** A regra pode mudar depois: a nota guarda a versão publicada que usou, não a regra viva. */
  test('a nota congela a versão publicada da regra de frete no snapshot', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    const snapshot = recording.invoices[0]?.calculationSnapshot as {
      readonly ruleSnapshot: { readonly freightRuleVersionId: string; readonly ruleVersion: string }
    }
    expect(snapshot.ruleSnapshot.freightRuleVersionId).toBe(RULE_VERSION_ID)
    expect(snapshot.ruleSnapshot.ruleVersion).toBe('2')
  })

  test('a nota é criada em nome do usuário do contexto, com o tomador resolvido pelo perfil', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    expect(recording.invoices[0]?.createdByUserId).toBe(USER_ID)
    expect(recording.invoices[0]?.emissionProfileId).toBe(PROFILE_ID)
    expect(recording.invoices[0]?.takerTaxId).toBe('98765432000188')
    expect(recording.invoices[0]?.takerLegalName).toBe('Cliente Sintético Ltda')
  })

  test('o ISS incide sobre o serviço prestado, não sobre o valor da carga', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    expect(recording.invoices[0]?.serviceAmount).toBe('850.00')
    expect(recording.invoices[0]?.issAmount).toBe('42.50')
  })

  /**
   * O worker transmite exatamente o que a empresa viu na prévia: o payload é congelado com a
   * própria digital, e recalcular depois não é opção.
   */
  test('o payload congelado carrega a digital sha256 do próprio conteúdo', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    const payload = recording.payloads[0]
    expect(payload?.attemptId).toBe(ATTEMPT_ID)
    expect(payload?.invoiceId).toBe(INVOICE_ID)
    expect(payload?.payloadSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  /** Token da prefeitura fica selado na credencial: o payload guarda só o ponteiro para ela. */
  test('nem o payload nem o providerConfig carregam segredo', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    const payload = recording.payloads[0]
    expect(payload?.providerConfig).toEqual({
      credentialId: CREDENTIAL_ID,
      fiscalEnvironment: 'homologation',
      municipalRegistration: '123456',
      provider: 'notarp',
      taxId: '12345678000199',
    })
    const serialized = JSON.stringify({
      config: payload?.providerConfig,
      payload: payload?.payload,
    })
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('password')
  })

  /** A prefeitura nunca é chamada no request: o pedido só chega ao outbox. */
  test('o outbox recebe o evento de emissão com o ator e o correlation-id do pedido', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    expect(recording.events[0]?.eventName).toBe(NFSE_ISSUE_EVENT_NAME)
    expect(recording.outbox[0]?.eventType).toBe(NFSE_ISSUE_OUTBOX_EVENT)
    expect(recording.outbox[0]?.actorUserId).toBe(USER_ID)
    expect(recording.outbox[0]?.correlationId).toBe(CORRELATION_ID)
    expect(recording.outbox[0]?.invoiceId).toBe(INVOICE_ID)
  })

  test('a tentativa nasce com a chave de idempotência e a digital do pedido', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)

    expect(recording.attempts[0]?.idempotencyKey).toBe(IDEMPOTENCY_KEY)
    expect(recording.attempts[0]?.requestFingerprint).toBe(
      createInvoiceFingerprint({
        descriptionTemplate: '',
        documentIds: [DOCUMENT_ID],
        period: '',
        profileId: PROFILE_ID,
      }),
    )
    expect(recording.attempts[0]?.fiscalEnvironment).toBe('homologation')
  })

  /**
   * O texto que a prefeitura lê sai do perfil: o município é o da inscrição municipal, e o período
   * é o que o operador digitou no pedido — a data das notas não o decide.
   */
  test('a descrição escreve o município do perfil e o período digitado no pedido', async () => {
    const { recording, useCase } = createUseCase({
      documents: [
        selectionDocument(),
        selectionDocument({
          documentId: OTHER_DOCUMENT_ID,
          issuedAt: '2026-08-05T10:00:00.000Z',
          number: '000000124',
        }),
      ],
    })

    await useCase.create({
      ...CREATE_INPUT,
      descriptionTemplate: 'Entregas na cidade de {{municipio}} {{periodo}}.',
      documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      period: '03-08 a 07-08-2026',
    })

    expect(recording.invoices[0]?.description).toBe(
      'Entregas na cidade de Ribeirão Preto 03-08 a 07-08-2026.',
    )
  })

  /** Sem período digitado a frase fecha sem data nenhuma — o espaço fica em branco, e é isso. */
  test('período em branco não vira a janela das notas selecionadas', async () => {
    const { recording, useCase } = createUseCase({
      documents: [
        selectionDocument(),
        selectionDocument({
          documentId: OTHER_DOCUMENT_ID,
          issuedAt: '2026-08-05T10:00:00.000Z',
          number: '000000124',
        }),
      ],
    })

    await useCase.create({
      ...CREATE_INPUT,
      descriptionTemplate: 'Entregas na cidade de {{municipio}} {{periodo}}.',
      documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
    })

    expect(recording.invoices[0]?.description).toBe('Entregas na cidade de Ribeirão Preto .')
  })

  test('perfil que não é ativo não emite', async () => {
    const { recording, useCase } = createUseCase({ profile: { ...PROFILE, status: 'draft' } })

    await expect(useCase.create(CREATE_INPUT)).rejects.toThrow()
    expect(recording.invoices).toHaveLength(0)
  })

  test('sem credencial ativa não há emissão', async () => {
    const { recording, useCase } = createUseCase({ credential: null })

    await expect(useCase.create(CREATE_INPUT)).rejects.toThrow()
    expect(recording.invoices).toHaveLength(0)
  })

  /** Bloqueio na prévia é dado; na criação é erro — emitir metade da seleção seria surpresa. */
  test('documento bloqueado interrompe a criação inteira', async () => {
    const { recording, useCase } = createUseCase({
      documents: [selectionDocument({ status: 'cancelled' })],
    })

    await expect(useCase.create(CREATE_INPUT)).rejects.toThrow()
    expect(recording.invoices).toHaveLength(0)
  })

  /** Uma nota de serviço com dois tomadores é inválida: a seleção precisa voltar para a tela. */
  test('seleção com dois tomadores é recusada na criação', async () => {
    const { recording, useCase } = createUseCase({
      documents: [
        selectionDocument(),
        selectionDocument({
          documentId: OTHER_DOCUMENT_ID,
          number: '000000124',
          recipientLegalName: 'Outro Cliente Ltda',
          recipientTaxId: '11222333000144',
        }),
      ],
    })

    await expect(
      useCase.create({ ...CREATE_INPUT, documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID] }),
    ).rejects.toThrow()
    expect(recording.invoices).toHaveLength(0)
  })
})
