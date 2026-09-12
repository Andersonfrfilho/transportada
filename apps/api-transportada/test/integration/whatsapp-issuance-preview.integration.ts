/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — o AC3 de ponta a ponta: webhook assinado, Graph API fake, grafo publicado (T008) e
 * a prévia pelos repositórios reais. A faixa 1200–1250 de um emitente devolve
 * "51 notas · 38 CT-e · 11 NFS-e · 2 bloqueadas", e a classificação congelada no pedido é, nota por
 * nota, a mesma que a listagem de Notas publica para o painel.
 */
import { createHmac } from 'node:crypto'
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { FlowGraphRepository } from '@adatechnology/meta-whatsapp-module'
import { eq } from 'drizzle-orm'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyFiscalProfiles,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  freightRules,
  freightRuleVersions,
  identityUsers,
  membershipRoles,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  nfeVolumes,
  nfseEmissionProfiles,
  nfseProviderCredentials,
  storedObjects,
  userCompanyMemberships,
  whatsAppCommandRequests,
} from '../../src/database/database.schema.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository.js'
import { DrizzleNfeDocumentRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository.js'
import { createNfseInvoiceUseCase } from '../../src/nfse-invoices/application/nfse-invoice.use-case.js'
import { DrizzleNfseInvoiceRepository } from '../../src/nfse-invoices/infrastructure/drizzle-nfse-invoice.repository.js'
import type { NfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { createPreviewDocumentSelectionUseCase } from '../../src/whatsapp-commands/application/preview-document-selection.use-case.js'
import { createNfseCredentialGapFinder } from '../../src/whatsapp-commands/application/preview-nfse-blocks.service.js'
import { createIssuanceWhatsAppFlowActions } from '../../src/whatsapp-commands/application/register-issuance-flow-actions.js'
import { createResolveWhatsAppActorUseCase } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createModuleWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import {
  buildEmitterKey,
  resolveDueDate,
} from '../../src/whatsapp-commands/domain/document-selection.policy.js'
import { validateFlowGraphForWhatsApp } from '../../src/whatsapp-commands/domain/whatsapp-menu.policy.js'
import { ISSUANCE_CONFIRM_ANSWER_PREFIX } from '../../src/whatsapp-commands/domain/whatsapp-issuance-flow.constant.js'
import { DrizzleDocumentSelectionRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-document-selection.repository.js'
import { DrizzleWhatsAppCommandRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-command.repository.js'
import { DrizzleWhatsAppPhoneRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'
import {
  WHATSAPP_ROOT_FLOW_GRAPH,
  WHATSAPP_ROOT_FLOW_GRAPH_KEY,
} from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'
import { createWhatsAppCommandHookFactory } from '../../src/whatsapp-commands/infrastructure/whatsapp-command-hook.factory.js'
import { createDrizzleWhatsAppFlowGraphPublisher } from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph-publisher.factory.js'
import { createMetaWhatsAppModuleResolver } from '../../src/whatsapp/application/meta-whatsapp-module.resolver.js'
import { createDrizzleWebhookNonceStore } from '../../src/whatsapp/infrastructure/drizzle-webhook-nonce.store.js'
import { createWhatsAppWebhookRoutes } from '../../src/whatsapp/presentation/whatsapp-webhook.routes.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type Database = TestDatabase['db']

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const APP_SECRET = 'app-secret-t012'
const VERIFY_TOKEN = 'verify-token-t012'
const API_VERSION = 'v21.0'
const ENVELOPE = {
  algorithm: 'A256GCM' as const,
  ciphertext: 'cipher',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1 as const,
}
const NOT_STORAGE = {} as NfeStorageGateway
const SHA = 'c'.repeat(64)

/** O emitente das 51 notas: o perfil de CT-e casa pela raiz dele, o de NFS-e pelo destinatário B. */
const EMITTER_TAX_ID = '11222333000181'
const RECIPIENT_CTE_TAX_ID = '44555666000109'
const RECIPIENT_NFSE_TAX_ID = '77888999000105'
const CARRIER_TAX_ID = '12345678000195'
const FIRST_NUMBER = 1200
const LAST_NUMBER = 1250
const FIRST_NFSE_NUMBER = 1240
const NUMBERS_WITHOUT_WEIGHT = new Set([1201, 1233])

type GraphRequest = { readonly body: Record<string, unknown>; readonly path: string }

const graphRequests: GraphRequest[] = []
let graphServer: ReturnType<typeof Bun.serve> | undefined
let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  graphServer = Bun.serve({
    async fetch(request) {
      graphRequests.push({
        body: (await request.json()) as Record<string, unknown>,
        path: new URL(request.url).pathname,
      })
      return Response.json({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] })
    },
    hostname: '127.0.0.1',
    port: 0,
  })

  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_144_t012_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    await runAllDatabaseMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
})

afterAll(async () => {
  await graphServer?.stop(true)
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

describe('a prévia da emissão por seleção pelo WhatsApp (spec 144 T012, AC3)', () => {
  testWithPostgres(
    'faixa 1200–1250 de um emitente → volumetria que bate com a listagem, nota por nota',
    async () => {
      const db = requireDatabase()
      const world = await seedCompany(db, { withProfiles: true })
      const intruder = await seedCompany(db, { withProfiles: false })
      await new DrizzleWhatsAppPhoneRepository(db).saveVerified({
        phone: world.phone,
        userId: world.userId,
        verifiedAt: new Date(),
      })

      expect(validateFlowGraphForWhatsApp(WHATSAPP_ROOT_FLOW_GRAPH)).toEqual([])
      await createDrizzleWhatsAppFlowGraphPublisher(db)({
        companyId: world.companyId,
        graph: WHATSAPP_ROOT_FLOW_GRAPH,
        publishedBy: 'code',
        source: 'code',
      })
      const scenario = await buildScenario(db, world.companyId)
      const tap = (id: string) =>
        scenario.receive({
          from: world.phone,
          interactive: { list_reply: { id, title: id }, type: 'list_reply' },
          type: 'interactive',
        })
      const type = (body: string) =>
        scenario.receive({ from: world.phone, text: { body }, type: 'text' })

      await type('oi')
      await scenario.receive({
        from: world.phone,
        interactive: {
          button_reply: { id: 'emitir_documentos', title: '📄 Emitir documentos' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      await tap('number_range')
      // Só o emitente com nota pendente é oferecido, pela chave opaca — nunca o CNPJ.
      expect(scenario.listRowIds()).toContain(buildEmitterKey(EMITTER_TAX_ID))
      expect(JSON.stringify(scenario.sentMessages())).not.toContain(EMITTER_TAX_ID)

      await tap(buildEmitterKey(EMITTER_TAX_ID))
      // Série única: o bot não pergunta, vai direto ao número inicial.
      expect(scenario.texts().at(-2)).toContain('número inicial')
      await type(String(FIRST_NUMBER))
      await type(String(LAST_NUMBER))
      expect(scenario.listRowIds()).toEqual(['7', '15', '30'])
      await tap('15')
      expect(scenario.listRowIds()).toEqual(['skip'])
      await tap('skip')

      expect(scenario.texts()).toContain('51 notas · 38 CT-e · 11 NFS-e · 2 bloqueadas')
      expect(scenario.texts()).toContain('Bloqueadas:\n• Sem peso da carga: 1201, 1233')

      const [request] = await db
        .select()
        .from(whatsAppCommandRequests)
        .where(eq(whatsAppCommandRequests.companyId, world.companyId))
      if (request === undefined) throw new Error('a prévia não congelou o pedido')
      expect(scenario.listRowIds()).toEqual([
        `${ISSUANCE_CONFIRM_ANSWER_PREFIX}${request.id}`,
        'back',
      ])
      expect(request.status).toBe('previewed')
      expect(request.previewSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(request.period).toBeNull()
      expect(request.dueDate).toBe(resolveDueDate({ days: 15, now: new Date() }))
      expect(request.selection).toHaveLength(51)
      for (const documentId of intruder.documentIds) {
        expect(request.selection).not.toContain(documentId)
      }

      // Paridade com a listagem do painel, nota por nota (AC3, segunda metade).
      const listing = await new DrizzleNfeDocumentRepository(db, NOT_STORAGE).list({
        accessKey: null,
        context: world.context,
        cursor: null,
        limit: 200,
      })
      const listed = new Map(listing.items.map((item) => [item.id, item.documentOutput]))
      for (const entry of request.classification) {
        // O id vai junto para a falha dizer qual nota discordou.
        expect([entry.documentId, listed.get(entry.documentId)]).toEqual([
          entry.documentId,
          entry.classification,
        ])
      }
    },
    120_000,
  )
})

type SeededCompany = {
  readonly companyId: string
  readonly context: {
    readonly companyId: string
    readonly kind: 'company'
    readonly membershipId: string
    readonly permissions: Set<never>
    readonly roles: never[]
    readonly userId: string
  }
  readonly documentIds: readonly string[]
  readonly phone: string
  readonly userId: string
}

async function seedCompany(
  db: Database,
  input: { readonly withProfiles: boolean },
): Promise<SeededCompany> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await db.insert(companies).values({ id: companyId, status: 'active' })
  await db.insert(identityUsers).values({ id: userId, status: 'active' })
  await db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await db.insert(membershipRoles).values({ membershipId, role: 'company-admin' })
  await db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${companyId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${companyId}`,
    id: importId,
    idempotencyKey: `import-${companyId}`,
    requestFingerprint: `fingerprint-${companyId}`,
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  if (input.withProfiles) await seedProfiles(db, { companyId, userId })

  const numbers = input.withProfiles
    ? Array.from({ length: LAST_NUMBER - FIRST_NUMBER + 1 }, (_, index) => FIRST_NUMBER + index)
    : [FIRST_NUMBER, 1220]
  const documentIds = await Promise.all(
    numbers.map((number) => seedDocument(db, { companyId, importId, number, userId, xmlObjectId })),
  )

  return {
    companyId,
    context: {
      companyId,
      kind: 'company',
      membershipId,
      permissions: new Set(),
      roles: [],
      userId,
    },
    documentIds,
    phone: `55169${randomDigits(8)}`,
    userId,
  }
}

/**
 * O perfil de CT-e casa pela **raiz** do emitente; o de NFS-e pelo destinatário B, **completo**.
 * Precisão completa vence raiz (`compareMatches`), então as notas de B vão para NFS-e e as demais
 * ficam no CT-e — duas saídas de um emitente só, que é o que o AC3 descreve.
 */
async function seedProfiles(
  db: Database,
  input: { readonly companyId: string; readonly userId: string },
): Promise<void> {
  const { companyId, userId } = input
  const freightRuleId = crypto.randomUUID()
  const nfseProfileId = crypto.randomUUID()
  await db.insert(freightRules).values({
    companyId,
    createdByUserId: userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: 'Frete AC3',
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await db.insert(freightRuleVersions).values({
    companyId,
    createdByUserId: userId,
    filters: {},
    freightRuleId,
    id: crypto.randomUUID(),
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await db.insert(nfseEmissionProfiles).values({
    chargeComponentLabel: 'Frete',
    cnaeCode: '4930202',
    companyId,
    createdByUserId: userId,
    descriptionTemplate: 'Transporte {{periodo}}',
    freightRuleId,
    id: nfseProfileId,
    municipalityIbgeCode: '3543402',
    municipalityName: 'Ribeirao Preto',
    name: 'NFS-e AC3',
    serviceListItem: '1602',
    status: 'active',
    taker: '3',
  })
  await seedEmissionProfile(db, {
    companyId,
    freightRuleId,
    matcher: { matchRole: 'sender', taxId: EMITTER_TAX_ID.slice(0, 8) },
    nfseEmissionProfileId: null,
    userId,
  })
  await seedEmissionProfile(db, {
    companyId,
    freightRuleId,
    matcher: { matchRole: 'recipient', taxId: RECIPIENT_NFSE_TAX_ID },
    nfseEmissionProfileId: nfseProfileId,
    userId,
  })
  await seedNfseCredential(db, companyId)
}

async function seedEmissionProfile(
  db: Database,
  input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly matcher: { readonly matchRole: 'recipient' | 'sender'; readonly taxId: string }
    readonly nfseEmissionProfileId: string | null
    readonly userId: string
  },
): Promise<void> {
  const profileId = crypto.randomUUID()
  await db.insert(cteEmissionProfiles).values({
    cfopInternal: '5353',
    cfopInterstate: '6353',
    chargeComponentLabel: 'FRETE PESO',
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightRuleId: input.freightRuleId,
    groupingMode: 'per_invoice',
    icmsCst: '00',
    icmsRate: '0.120000',
    id: profileId,
    matchMode: 'sender_tax_id',
    name: `Perfil ${input.matcher.taxId}`,
    nfseEmissionProfileId: input.nfseEmissionProfileId,
    operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
    outputDocument: input.nfseEmissionProfileId === null ? 'cte' : 'nfse',
    predominantProductMode: 'highest_value',
    receiverIeIndicator: '1',
    status: 'active',
    taker: '0',
  })
  await db.insert(cteEmissionProfileMatchers).values({
    companyId: input.companyId,
    matchRole: input.matcher.matchRole,
    profileId,
    taxId: input.matcher.taxId,
  })
}

/** Sem credencial ativa as 11 notas de NFS-e sairiam bloqueadas na prévia — é o outro contrato. */
async function seedNfseCredential(db: Database, companyId: string): Promise<void> {
  await db.insert(companyFiscalProfiles).values({
    city: 'Ribeirao Preto',
    cityIbgeCode: '3543402',
    cnpj: CARRIER_TAX_ID,
    companyId,
    complement: '',
    district: 'Centro',
    email: 'fiscal@example.test',
    legalName: 'Transportadora AC3 Ltda',
    municipalRegistration: '123456',
    number: '100',
    phone: '1630000000',
    postalCode: '14000000',
    rntrc: '58151044',
    state: 'SP',
    stateRegistration: '110000000000',
    street: 'Rua da Transportadora',
    taxRegime: '1',
    tradeName: 'Transportadora AC3',
  })
  await db.insert(nfseProviderCredentials).values({
    callbackTokenSha256: crypto.randomUUID().replaceAll('-', '').repeat(2),
    companyId,
    fiscalEnvironment: 'homologation',
    municipalRegistration: '123456',
    secretEnvelope: {},
    taxId: CARRIER_TAX_ID,
  })
}

async function seedDocument(
  db: Database,
  input: {
    readonly companyId: string
    readonly importId: string
    readonly number: number
    readonly userId: string
    readonly xmlObjectId: string
  },
): Promise<string> {
  const documentId = crypto.randomUUID()
  const emitterId = crypto.randomUUID()
  const recipientId = crypto.randomUUID()
  const number = String(input.number)
  const recipientTaxId =
    input.number >= FIRST_NFSE_NUMBER ? RECIPIENT_NFSE_TAX_ID : RECIPIENT_CTE_TAX_ID

  await db.insert(nfeDocuments).values({
    accessKey: `352609${EMITTER_TAX_ID}55001${number.padStart(9, '0')}1000000010`,
    authorizationProtocol: `protocol-${documentId}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId: input.importId,
    issuedAt: new Date('2026-09-10T12:00:00.000Z'),
    model: '55',
    number,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId: input.xmlObjectId,
    xmlSha256: SHA,
  })
  await db.insert(nfeParticipants).values([
    {
      companyId: input.companyId,
      documentId,
      id: emitterId,
      legalName: 'Emitente AC3 Ltda',
      role: 'emitter',
      stateRegistration: '110000000110',
      taxId: EMITTER_TAX_ID,
    },
    {
      companyId: input.companyId,
      documentId,
      id: recipientId,
      legalName: 'Destinatario AC3 Ltda',
      role: 'recipient',
      stateRegistration: 'ISENTO',
      taxId: recipientTaxId,
    },
  ])
  await db
    .insert(nfeAddresses)
    .values([
      buildAddress(input.companyId, emitterId, { city: 'Sao Paulo', cityCode: '3550308' }),
      buildAddress(input.companyId, recipientId, { city: 'Rio de Janeiro', cityCode: '3304557' }),
    ])
  if (!NUMBERS_WITHOUT_WEIGHT.has(input.number)) {
    await db.insert(nfeVolumes).values({
      companyId: input.companyId,
      documentId,
      grossWeight: '120.0000',
      netWeight: '100.0000',
      ordinal: 1n,
      quantity: '4.0000',
    })
  }
  return documentId
}

function buildAddress(
  companyId: string,
  participantId: string,
  place: { readonly city: string; readonly cityCode: string },
) {
  return {
    city: place.city,
    cityCode: place.cityCode,
    companyId,
    district: 'Centro',
    number: '100',
    participantId,
    postalCode: '01000000',
    state: place.cityCode.startsWith('33') ? 'RJ' : 'SP',
    street: 'Rua das Amostras',
  }
}

async function buildScenario(db: Database, companyId: string) {
  const phoneNumberId = randomDigits(15)
  const record = (): void => undefined
  const logger = { error: record, info: record, warn: record }
  const baseUrl = `http://127.0.0.1:${graphServer?.port}`

  const selection = new DrizzleDocumentSelectionRepository(db)
  const nfseInvoiceRepository = new DrizzleNfseInvoiceRepository(db)
  const nfseInvoices = createNfseInvoiceUseCase({
    now: () => new Date(),
    repository: nfseInvoiceRepository,
  })
  const issuanceFlowActions = createIssuanceWhatsAppFlowActions({
    clock: () => new Date(),
    listIssueDateEmitters: (input) => selection.listIssueDateEmitters(input),
    listPendingEmitters: (input) => selection.listPendingEmitters(input),
    listPendingSeries: (input) => selection.listPendingSeries(input),
    listRecentTrips: (input) => selection.listRecentTrips(input),
    previewSelection: createPreviewDocumentSelectionUseCase({
      classifier: new DrizzleNfeDocumentRepository(db, NOT_STORAGE),
      clock: () => new Date(),
      commands: new DrizzleWhatsAppCommandRepository(db),
      findNfseCredentialGap: createNfseCredentialGapFinder(nfseInvoiceRepository),
      generateId: () => crypto.randomUUID(),
      previewNfseInvoices: (input) => nfseInvoices.preview(input),
      selection,
    }),
  })

  const resolver = createMetaWhatsAppModuleResolver({
    apiVersion: API_VERSION,
    appSecret: APP_SECRET,
    baseUrl,
    buildMessageHook: createWhatsAppCommandHookFactory({
      apiVersion: API_VERSION,
      authorization: new AuthorizationService(),
      baseUrl,
      clock: () => new Date(),
      flowActions: issuanceFlowActions,
      graphs: createModuleWhatsAppFlowGraphProvider({
        repository: new FlowGraphRepository(db as never),
        rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
      }),
      logger,
      rateLimiter: createRateLimiter(),
      resolveActor: createResolveWhatsAppActorUseCase({
        memberships: new DrizzleMembershipRepository(db),
        phones: new DrizzleWhatsAppPhoneRepository(db),
        tenantContext: new TenantContextService({
          repository: new DrizzleMembershipRepository(db),
        }),
      }),
    }),
    database: db,
    nonceStore: createDrizzleWebhookNonceStore(db),
    repository: {
      findByPhoneNumberId: async (input) =>
        input.phoneNumberId === phoneNumberId
          ? {
              channelId: `channel-${phoneNumberId}`,
              companyId,
              envelope: ENVELOPE,
              phoneNumberId,
              version: '1',
              wabaId: '',
            }
          : undefined,
    },
    secretService: {
      decrypt: async () => ({ accessToken: 'access-token-t012' }),
      encrypt: async () => ENVELOPE,
    },
    verifyToken: VERIFY_TOKEN,
  })
  const post = createWhatsAppWebhookRoutes({
    appSecret: APP_SECRET,
    logger,
    resolver,
    verifyToken: VERIFY_TOKEN,
  }).find((route) => route.method === 'POST')
  if (post === undefined) throw new Error('rota do webhook não registrada')

  async function receive(message: Record<string, unknown>): Promise<void> {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Operador' }, wa_id: message.from }],
                messages: [
                  { id: `wamid.${crypto.randomUUID()}`, timestamp: '1757592000', ...message },
                ],
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '5516000000000', phone_number_id: phoneNumberId },
              },
            },
          ],
          id: 'waba-t012',
        },
      ],
      object: 'whatsapp_business_account',
    })
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
    const response = await post?.execute({
      correlationId: 'corr-t012',
      pathParameters: {},
      request: new Request('https://api.local/public/whatsapp/webhook', {
        body,
        headers: { 'x-hub-signature-256': signature },
        method: 'POST',
      }),
    })
    expect(response?.status).toBe(200)
  }

  const sentMessages = (): readonly GraphRequest[] =>
    graphRequests.filter((request) => request.path === `/${API_VERSION}/${phoneNumberId}/messages`)

  const texts = (): string[] =>
    sentMessages().flatMap((request) => {
      const text = request.body.text as { readonly body?: unknown } | undefined
      return typeof text?.body === 'string' ? [text.body] : []
    })

  /** Os ids da última lista enviada — é nela que a próxima resposta toca. */
  const listRowIds = (): string[] => {
    const lists = sentMessages().flatMap((request) => {
      const interactive = request.body.interactive as
        | { readonly action?: { readonly sections?: { readonly rows?: { id: string }[] }[] } }
        | undefined
      const rows = interactive?.action?.sections?.flatMap((section) => section.rows ?? [])
      return rows === undefined ? [] : [rows.map((row) => row.id)]
    })
    return lists.at(-1) ?? []
  }

  return { listRowIds, receive, sentMessages, texts }
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')
}

function requireDatabase(): Database {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  return shared.database.db
}
