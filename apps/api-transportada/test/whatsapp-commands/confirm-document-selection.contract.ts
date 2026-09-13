/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T013 — a confirmação com fakes. Sem transação única: o pedido passa a `confirming` numa
 * transação curta, e cada grupo corre pelo seu caso de uso, com a chave derivada do pedido. A prova
 * contra Postgres dos AC4 e AC5 fica em `test/integration/whatsapp-issuance-confirm.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import type { CreateCteBatchInput } from '../../src/cte-batches/application/cte-batch.port.js'
import type { CteIssuanceIssueInput } from '../../src/cte-issuance/application/cte-issuance.use-case.js'
import { WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN } from '../../src/database/whatsapp-command.schema.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { DocumentOutputDescription } from '../../src/nfe-documents/application/nfe-document.types.js'
import type { CreateNfseInvoiceInput } from '../../src/nfse-invoices/application/nfse-invoice.use-case.js'
import type { NfseInvoicePreview } from '../../src/nfse-invoices/application/nfse-invoice-preview.service.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  type ConfirmDocumentSelectionDependencies,
  createConfirmDocumentSelectionUseCase,
} from '../../src/whatsapp-commands/application/confirm-document-selection.use-case.js'
import { createPreviewDocumentSelectionUseCase } from '../../src/whatsapp-commands/application/preview-document-selection.use-case.js'
import type {
  MarkWhatsAppCommandJournalStepInput,
  WhatsAppCommandJournalStep,
  WhatsAppCommandRepositoryPort,
  WhatsAppCommandRequest,
} from '../../src/whatsapp-commands/application/whatsapp-command.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001601'
const USER_ID = '00000000-0000-4000-8000-000000001602'
const PROFILE_A = '00000000-0000-4000-8000-00000000160a'
const PROFILE_B = '00000000-0000-4000-8000-00000000160b'
const NFSE_PROFILE = '00000000-0000-4000-8000-00000000160c'
const DOC_A = '00000000-0000-4000-8000-000000001611'
const DOC_B = '00000000-0000-4000-8000-000000001612'
const DOC_N = '00000000-0000-4000-8000-000000001613'
const TAKER = '22222222000191'
const PERIOD = 'setembro/2026'
const NOW = new Date('2026-09-11T15:00:00.000Z')

const ALL_PERMISSIONS: readonly CompanyPermission[] = ['cte.manage', 'cte.submit', 'nfse.issue']

function describeCte(profileId: string, freightAmount = '35.0000'): DocumentOutputDescription {
  return {
    classification: { output: 'cte' },
    freightAmount,
    number: profileId === PROFILE_A ? '1200' : '1201',
    profile: { id: profileId, takerTaxId: '11111111000191', version: '1' },
  }
}

const NFSE_DESCRIPTION: DocumentOutputDescription = {
  classification: { nfseProfileId: NFSE_PROFILE, output: 'nfse' },
  freightAmount: '10.0000',
  number: '1202',
  profile: { id: PROFILE_A, takerTaxId: '11111111000191', version: '1' },
}

const NFSE_PREVIEW: NfseInvoicePreview = {
  blocked: [],
  invoices: [
    {
      calculatedAmount: '12.0000',
      documents: [{ documentId: DOC_N }],
      takerTaxId: TAKER,
    } as unknown as NfseInvoicePreview['invoices'][number],
  ],
}

function buildActor(
  permissions: readonly CompanyPermission[] = ALL_PERMISSIONS,
  userId = USER_ID,
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      channel: 'whatsapp',
      companyIdClaim: COMPANY_ID,
      externalIdentityId: 'external',
      issuer: 'https://keycloak.example/realms/transportada',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'subject',
      userId,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000001605',
      permissions: new Set(permissions),
      roles: ['operator'],
      userId,
    },
  }
}

/** O repositório em memória: o `claim` decide o vencedor antes do primeiro `await`, como o UPDATE. */
function buildCommandStore() {
  const requests = new Map<string, WhatsAppCommandRequest>()
  const journal: WhatsAppCommandJournalStep[] = []
  let stepCounter = 0
  const kindOrder = ['cte_batch', 'nfse_invoice', 'billing_invoice']
  const commands: ConfirmDocumentSelectionDependencies['commands'] &
    Pick<WhatsAppCommandRepositoryPort, 'findById'> = {
    claimForConfirmation: async (input) => {
      const request = requests.get(input.id)
      if (request === undefined || request.status !== 'previewed') return undefined
      if (request.previewSha256 !== input.previewSha256) return undefined
      if (request.expiresAt.getTime() <= input.now.getTime()) return undefined
      const claimed = { ...request, confirmedAt: input.now, status: 'confirming' as const }
      requests.set(input.id, claimed)
      for (const step of input.steps) {
        stepCounter += 1
        journal.push({
          documentId: undefined,
          documentKind: step.documentKind,
          groupKey: step.groupKey,
          id: `step-${stepCounter}`,
          idempotencyKey: step.idempotencyKey,
          lastErrorCode: undefined,
          requestId: input.id,
          status: 'pending',
        })
      }
      return claimed
    },
    createPreview: async (input) => {
      const request: WhatsAppCommandRequest = {
        actorUserId: input.actorUserId,
        classification: input.classification,
        companyId: input.companyId,
        confirmedAt: undefined,
        dueDate: input.dueDate,
        expiresAt: input.expiresAt,
        groupingMode: input.groupingMode,
        id: input.id,
        kind: input.kind,
        lastErrorCode: undefined,
        membershipId: 'membership',
        period: input.period,
        previewSha256: input.previewSha256,
        selection: input.selection,
        settledAt: undefined,
        settlementAttempts: 0,
        settlementOutcome: undefined,
        status: 'previewed',
      }
      requests.set(input.id, request)
      return request
    },
    findById: async (input) => {
      const request = requests.get(input.id)
      return request?.companyId === input.companyId ? request : undefined
    },
    listJournal: async (input) =>
      journal
        .filter((step) => step.requestId === input.requestId)
        .toSorted(
          (left, right) =>
            kindOrder.indexOf(left.documentKind) - kindOrder.indexOf(right.documentKind) ||
            left.groupKey.localeCompare(right.groupKey),
        ),
    markDispatched: async (input) => transition(input.id, 'confirming', 'dispatched'),
    markExpired: async (input) => transition(input.id, 'previewed', 'expired'),
    markJournalStep: async (input) => {
      const index = journal.findIndex((step) => step.id === input.id)
      const current = journal[index]
      if (current === undefined) return false
      journal[index] = {
        ...current,
        documentId: input.documentId ?? current.documentId,
        lastErrorCode: input.errorCode,
        status: input.status,
      }
      return true
    },
    markSuperseded: async (input) => transition(input.id, 'previewed', 'superseded'),
  }

  function transition(
    id: string,
    from: WhatsAppCommandRequest['status'],
    to: WhatsAppCommandRequest['status'],
  ): boolean {
    const request = requests.get(id)
    if (request?.status !== from) return false
    requests.set(id, { ...request, status: to })
    return true
  }

  return { commands, journal, requests }
}

/** Os casos de uso fiscais, fakes com a mesma idempotência: chave repetida devolve o que já existe. */
function buildIssuers() {
  const batches = new Map<string, { readonly fingerprint: string; readonly id: string }>()
  const issued = new Map<string, string>()
  const invoices = new Map<string, { readonly fingerprint: string; readonly id: string }>()
  const calls = {
    create: [] as CreateCteBatchInput[],
    issue: [] as CteIssuanceIssueInput[],
    nfse: [] as CreateNfseInvoiceInput[],
  }
  const hooks: {
    beforeCreate: (input: CreateCteBatchInput) => void
    beforeIssue: (input: CteIssuanceIssueInput) => void
  } = {
    beforeCreate: () => undefined,
    beforeIssue: () => undefined,
  }

  const createCteBatch = async (input: CreateCteBatchInput) => {
    calls.create.push(input)
    hooks.beforeCreate(input)
    const fingerprint = JSON.stringify([
      input.name,
      input.emissionProfileId,
      input.groupingMode,
      input.documentIds,
    ])
    const existing = batches.get(input.idempotencyKey)
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new ApiError({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'reused', status: 409 })
      }
      return { id: existing.id }
    }
    const created = { fingerprint, id: `batch-${batches.size + 1}` }
    batches.set(input.idempotencyKey, created)
    return { id: created.id }
  }
  const issueCteBatch = async (input: CteIssuanceIssueInput) => {
    calls.issue.push(input)
    hooks.beforeIssue(input)
    const previous = issued.get(input.idempotencyKey)
    if (previous !== undefined && previous !== input.batchId) {
      throw new ApiError({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'reused', status: 409 })
    }
    issued.set(input.idempotencyKey, input.batchId)
    return {}
  }
  const createNfseInvoice = async (input: CreateNfseInvoiceInput) => {
    calls.nfse.push(input)
    const fingerprint = JSON.stringify([input.profileId, input.period, input.documentIds])
    const existing = invoices.get(input.idempotencyKey)
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new ApiError({ code: 'NFSE_IDEMPOTENCY_KEY_REUSED', message: 'reused', status: 409 })
      }
      return { invoiceId: existing.id }
    }
    const created = { fingerprint, id: `invoice-${invoices.size + 1}` }
    invoices.set(input.idempotencyKey, created)
    return { invoiceId: created.id }
  }

  return {
    batches,
    calls,
    createCteBatch,
    createNfseInvoice,
    hooks,
    invoices,
    issueCteBatch,
    issued,
  }
}

type Harness = ReturnType<typeof buildHarness>

function buildHarness(
  input: { readonly documents?: ReadonlyMap<string, DocumentOutputDescription> } = {},
) {
  const store = buildCommandStore()
  const issuers = buildIssuers()
  const clock = { now: NOW }
  let idCounter = 0
  const descriptions = {
    current:
      input.documents ??
      new Map<string, DocumentOutputDescription>([
        [DOC_A, describeCte(PROFILE_A)],
        [DOC_B, describeCte(PROFILE_B)],
        [DOC_N, NFSE_DESCRIPTION],
      ]),
  }
  const deps: ConfirmDocumentSelectionDependencies = {
    authorization: new AuthorizationService(),
    classifier: {
      describeDocumentOutputs: async (request) =>
        new Map(
          [...descriptions.current].filter(([documentId]) =>
            request.documentIds.includes(documentId),
          ),
        ),
    },
    clock: () => clock.now,
    commands: store.commands,
    createCteBatch: issuers.createCteBatch,
    createNfseInvoice: issuers.createNfseInvoice,
    findNfseCredentialGap: async () => undefined,
    generateId: () => {
      idCounter += 1
      return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`
    },
    issueCteBatch: issuers.issueCteBatch,
    previewNfseInvoices: async () => NFSE_PREVIEW,
    selection: {
      findCteProfileNames: async () =>
        new Map([
          [PROFILE_A, 'Perfil A'],
          [PROFILE_B, 'Perfil B'],
        ]),
      findNfseProfileVersions: async () => new Map([[NFSE_PROFILE, '3']]),
      resolveSelection: async () => ({
        documentIds: [...descriptions.current.keys()],
        total: descriptions.current.size,
      }),
    },
  }
  return { clock, deps, descriptions, issuers, store }
}

async function freeze(harness: Harness): Promise<string> {
  const outcome = await createPreviewDocumentSelectionUseCase(harness.deps)({
    context: buildActor().scope,
    criterion: { kind: 'trip', tripId: '00000000-0000-4000-8000-000000001699' },
    dueDays: 15,
    period: PERIOD,
  })
  if (outcome.kind !== 'previewed') throw new Error(`prévia não congelou: ${outcome.kind}`)
  return outcome.requestId
}

function useCase(harness: Harness) {
  return createConfirmDocumentSelectionUseCase(harness.deps)
}

function stepStatuses(harness: Harness) {
  return harness.store.journal.map((step) => [step.documentKind, step.groupKey, step.status])
}

describe('confirmar é emitir o que foi visto (spec 144 T013)', () => {
  test('grupo a grupo: lote por perfil criado e emitido, NFS-e por perfil e tomador, e dispatched', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    const outcome = await useCase(harness).confirm({ actor: buildActor(), requestId })

    expect(outcome).toEqual({ failures: [], issued: 3, kind: 'dispatched' })
    expect(harness.store.requests.get(requestId)?.status).toBe('dispatched')
    expect(stepStatuses(harness)).toEqual([
      ['cte_batch', PROFILE_A, 'issued'],
      ['cte_batch', PROFILE_B, 'issued'],
      ['nfse_invoice', `${NFSE_PROFILE}:${TAKER}`, 'issued'],
    ])

    const prefix = requestId.slice(0, 8)
    expect(harness.issuers.calls.create.map((call) => [call.name, call.idempotencyKey])).toEqual([
      [`WhatsApp ${prefix} · Perfil A`, `whatsapp:${requestId}:cte:${PROFILE_A}`],
      [`WhatsApp ${prefix} · Perfil B`, `whatsapp:${requestId}:cte:${PROFILE_B}`],
    ])
    expect(harness.issuers.calls.create[0]).toMatchObject({
      context: { companyId: COMPANY_ID, userId: USER_ID },
      documentIds: [DOC_A],
      emissionProfileId: PROFILE_A,
    })
    expect(harness.issuers.calls.issue.map((call) => [call.batchId, call.idempotencyKey])).toEqual([
      ['batch-1', `whatsapp:${requestId}:cte-issue:${PROFILE_A}`],
      ['batch-2', `whatsapp:${requestId}:cte-issue:${PROFILE_B}`],
    ])
    expect(harness.issuers.calls.nfse).toEqual([
      expect.objectContaining({
        documentIds: [DOC_N],
        idempotencyKey: `whatsapp:${requestId}:nfse:${NFSE_PROFILE}:${TAKER}`,
        period: PERIOD,
        profileId: NFSE_PROFILE,
      }),
    ])
    expect(harness.store.journal.map((step) => step.documentId)).toEqual([
      'batch-1',
      'batch-2',
      'invoice-1',
    ])
  })

  test('toda chave usada tem o formato das rotas', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    await useCase(harness).confirm({ actor: buildActor(), requestId })
    const keys = [
      ...harness.issuers.calls.create.map((call) => call.idempotencyKey),
      ...harness.issuers.calls.issue.map((call) => call.idempotencyKey),
      ...harness.issuers.calls.nfse.map((call) => call.idempotencyKey),
      ...harness.store.journal.map((step) => step.idempotencyKey),
    ]
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(key).toMatch(WHATSAPP_COMMAND_IDEMPOTENCY_KEY_PATTERN)
  })

  describe('permissões: cte.manage e cte.submit com CT-e, nfse.issue com NFS-e', () => {
    const CTE_ONLY = new Map([[DOC_A, describeCte(PROFILE_A)]])
    const NFSE_ONLY = new Map([[DOC_N, NFSE_DESCRIPTION]])
    const MIXED = new Map<string, DocumentOutputDescription>([
      [DOC_A, describeCte(PROFILE_A)],
      [DOC_N, NFSE_DESCRIPTION],
    ])
    const cases: readonly [
      string,
      ReadonlyMap<string, DocumentOutputDescription>,
      CompanyPermission[],
    ][] = [
      ['só CT-e, sem cte.manage', CTE_ONLY, ['cte.submit', 'nfse.issue']],
      ['só CT-e, sem cte.submit', CTE_ONLY, ['cte.manage', 'nfse.issue']],
      ['só NFS-e, sem nfse.issue', NFSE_ONLY, ['cte.manage', 'cte.submit']],
      ['misto, sem cte.manage', MIXED, ['cte.submit', 'nfse.issue']],
      ['misto, sem cte.submit', MIXED, ['cte.manage', 'nfse.issue']],
      ['misto, sem nfse.issue', MIXED, ['cte.manage', 'cte.submit']],
    ]

    test.each(cases)(
      '%s → recusa antes de tocar em qualquer coisa',
      async (_name, documents, permissions) => {
        const harness = buildHarness({ documents })
        const requestId = await freeze(harness)
        const outcome = await useCase(harness).confirm({
          actor: buildActor(permissions),
          requestId,
        })
        expect(outcome).toEqual({ kind: 'forbidden' })
        expect(harness.store.requests.get(requestId)?.status).toBe('previewed')
        expect(harness.store.journal).toHaveLength(0)
        expect(harness.issuers.calls.create).toHaveLength(0)
        expect(harness.issuers.calls.nfse).toHaveLength(0)
      },
    )

    test('só CT-e não pede nfse.issue; só NFS-e não pede as de CT-e', async () => {
      const cte = buildHarness({ documents: CTE_ONLY })
      const cteRequest = await freeze(cte)
      expect(
        (
          await useCase(cte).confirm({
            actor: buildActor(['cte.manage', 'cte.submit']),
            requestId: cteRequest,
          })
        ).kind,
      ).toBe('dispatched')

      const nfse = buildHarness({ documents: NFSE_ONLY })
      const nfseRequest = await freeze(nfse)
      expect(
        (await useCase(nfse).confirm({ actor: buildActor(['nfse.issue']), requestId: nfseRequest }))
          .kind,
      ).toBe('dispatched')
    })
  })

  test('hash divergente não emite: o pedido vira superseded e sai uma prévia nova', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    harness.descriptions.current = new Map([
      [DOC_A, describeCte(PROFILE_A, '99.0000')],
      [DOC_B, describeCte(PROFILE_B)],
      [DOC_N, NFSE_DESCRIPTION],
    ])

    const outcome = await useCase(harness).confirm({ actor: buildActor(), requestId })
    if (outcome.kind !== 'superseded') throw new Error(`esperava superseded, veio ${outcome.kind}`)
    expect(outcome.next.kind).toBe('previewed')
    expect(harness.store.requests.get(requestId)?.status).toBe('superseded')
    if (outcome.next.kind === 'previewed') {
      const fresh = harness.store.requests.get(outcome.next.requestId)
      expect(fresh?.status).toBe('previewed')
      expect(fresh?.period).toBe(PERIOD)
      expect(fresh?.dueDate).toBe(harness.store.requests.get(requestId)?.dueDate)
    }
    expect(harness.store.journal).toHaveLength(0)
    expect(harness.issuers.calls.create).toHaveLength(0)
    expect(harness.issuers.calls.nfse).toHaveLength(0)
  })

  test('a nota que entrou em outro lote muda a classificação e pede nova prévia (AC4)', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    harness.descriptions.current = new Map([
      [
        DOC_A,
        {
          ...describeCte(PROFILE_A),
          classification: { output: 'blocked', reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED' },
        },
      ],
      [DOC_B, describeCte(PROFILE_B)],
      [DOC_N, NFSE_DESCRIPTION],
    ])
    const outcome = await useCase(harness).confirm({ actor: buildActor(), requestId })
    expect(outcome.kind).toBe('superseded')
    expect(harness.issuers.calls.create).toHaveLength(0)
  })

  test('vencida: markExpired e nada emite', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    harness.clock.now = new Date(NOW.getTime() + 15 * 60_000)
    expect(await useCase(harness).confirm({ actor: buildActor(), requestId })).toEqual({
      kind: 'expired',
    })
    expect(harness.store.requests.get(requestId)?.status).toBe('expired')
    expect(harness.issuers.calls.create).toHaveLength(0)
  })

  test('dois toques concorrentes: um lote por perfil, e o segundo responde com o estado (AC5)', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    const confirm = useCase(harness)
    const outcomes = await Promise.all([
      confirm.confirm({ actor: buildActor(), requestId }),
      confirm.confirm({ actor: buildActor(), requestId }),
    ])
    expect(outcomes.map((outcome) => outcome.kind).toSorted()).toEqual([
      'dispatched',
      'in_progress',
    ])
    expect(harness.issuers.batches.size).toBe(2)
    expect(harness.issuers.calls.create).toHaveLength(2)
    expect(harness.issuers.invoices.size).toBe(1)
    expect(harness.store.journal).toHaveLength(3)

    expect(await confirm.confirm({ actor: buildActor(), requestId })).toEqual({
      kind: 'already_dispatched',
    })
    expect(harness.issuers.calls.create).toHaveLength(2)
  })

  test('falha no meio: o grupo que falha fica failed com o código, e os outros seguem', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    harness.issuers.hooks.beforeCreate = (input) => {
      if (input.emissionProfileId !== PROFILE_B) return
      throw new ApiError({
        code: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
        message: 'linked',
        status: 409,
      })
    }
    const outcome = await useCase(harness).confirm({ actor: buildActor(), requestId })

    expect(outcome).toEqual({
      failures: [
        {
          documentKind: 'cte_batch',
          label: 'Perfil B',
          reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
        },
      ],
      issued: 2,
      kind: 'dispatched',
    })
    expect(stepStatuses(harness)).toEqual([
      ['cte_batch', PROFILE_A, 'issued'],
      ['cte_batch', PROFILE_B, 'failed'],
      ['nfse_invoice', `${NFSE_PROFILE}:${TAKER}`, 'issued'],
    ])
    expect(harness.store.journal[1]?.lastErrorCode).toBe('CTE_BATCH_DOCUMENT_ALREADY_LINKED')
    expect(harness.store.requests.get(requestId)?.status).toBe('dispatched')
  })

  test('erro que não é de domínio para no meio: o pedido fica confirming para a retomada', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    harness.issuers.hooks.beforeIssue = () => {
      throw new Error('connection terminated')
    }
    await expect(useCase(harness).confirm({ actor: buildActor(), requestId })).rejects.toThrow(
      'connection terminated',
    )
    expect(harness.store.requests.get(requestId)?.status).toBe('confirming')
    expect(stepStatuses(harness)[0]).toEqual(['cte_batch', PROFILE_A, 'created'])
    expect(harness.store.journal[0]?.documentId).toBe('batch-1')
  })

  test('retomada depois da queda entre created e issue: não duplica lote nem emissão', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    let crashes = 1
    harness.issuers.hooks.beforeIssue = () => {
      if (crashes === 0) return
      crashes -= 1
      throw new Error('connection terminated')
    }
    const confirm = useCase(harness)
    await expect(confirm.confirm({ actor: buildActor(), requestId })).rejects.toThrow()

    // O toque de novo não retoma quem está em curso: só a retomada explícita (T014) retoma.
    expect(await confirm.confirm({ actor: buildActor(), requestId })).toEqual({
      kind: 'in_progress',
    })
    const outcome = await confirm.resume({ actor: buildActor(), requestId })

    expect(outcome).toEqual({ failures: [], issued: 3, kind: 'dispatched' })
    expect(harness.issuers.batches.size).toBe(2)
    expect(
      harness.issuers.calls.create.filter((call) => call.emissionProfileId === PROFILE_A),
    ).toHaveLength(1)
    expect(harness.issuers.issued.size).toBe(2)
    expect(harness.issuers.invoices.size).toBe(1)
    expect(harness.store.requests.get(requestId)?.status).toBe('dispatched')
  })

  test('retomada depois da queda entre criar e anotar: a chave devolve o mesmo lote', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    const markStep = harness.store.commands.markJournalStep
    let crashes = 1
    harness.deps = {
      ...harness.deps,
      commands: {
        ...harness.store.commands,
        markJournalStep: async (input: MarkWhatsAppCommandJournalStepInput) => {
          if (input.status === 'created' && crashes > 0) {
            crashes -= 1
            throw new Error('connection terminated')
          }
          return markStep(input)
        },
      },
    }
    const confirm = createConfirmDocumentSelectionUseCase(harness.deps)
    await expect(confirm.confirm({ actor: buildActor(), requestId })).rejects.toThrow()
    expect(stepStatuses(harness)[0]).toEqual(['cte_batch', PROFILE_A, 'pending'])

    expect((await confirm.resume({ actor: buildActor(), requestId })).kind).toBe('dispatched')
    expect(harness.issuers.batches.size).toBe(2)
    expect(
      harness.issuers.calls.create.filter((call) => call.emissionProfileId === PROFILE_A),
    ).toHaveLength(2)
    expect(harness.store.journal[0]).toMatchObject({ documentId: 'batch-1', status: 'issued' })
  })

  test('retomada de pedido já despachado não emite de novo', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    const confirm = useCase(harness)
    await confirm.confirm({ actor: buildActor(), requestId })
    expect(await confirm.resume({ actor: buildActor(), requestId })).toEqual({
      kind: 'already_dispatched',
    })
    expect(harness.issuers.calls.create).toHaveLength(2)
  })

  test('pedido de outro usuário não é achado', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    const intruder = buildActor(ALL_PERMISSIONS, '00000000-0000-4000-8000-000000009999')
    expect(await useCase(harness).confirm({ actor: intruder, requestId })).toEqual({
      kind: 'not_found',
    })
    expect(harness.store.requests.get(requestId)?.status).toBe('previewed')
  })

  test('nome do lote e período saem só do pedido congelado', async () => {
    const harness = buildHarness()
    const requestId = await freeze(harness)
    const frozen = harness.store.requests.get(requestId)
    expect(frozen?.classification).toContainEqual({
      classification: { output: 'cte' },
      documentId: DOC_A,
      profileId: PROFILE_A,
      profileName: 'Perfil A',
      takerTaxId: '11111111000191',
    })
    // O perfil é renomeado depois do congelamento: a confirmação ainda usa o nome congelado.
    harness.deps = {
      ...harness.deps,
      selection: {
        ...harness.deps.selection,
        findCteProfileNames: async () => new Map([[PROFILE_A, 'Renomeado']]),
      },
    }
    await createConfirmDocumentSelectionUseCase(harness.deps).confirm({
      actor: buildActor(),
      requestId,
    })
    expect(harness.issuers.calls.create[0]?.name).toBe(
      `WhatsApp ${requestId.slice(0, 8)} · Perfil A`,
    )
  })
})
