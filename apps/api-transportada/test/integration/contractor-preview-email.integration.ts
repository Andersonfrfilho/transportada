/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): a entrada da prévia por e-mail contra Postgres. O token é gerado no servidor
 * e aparece UMA vez; só o hash vai ao banco; a rotação apaga o hash anterior; a auditoria nasce na mesma
 * transação e nunca leva token nem hash; e a empresa do contexto fecha todo acesso.
 */
import { createHash } from 'node:crypto'

import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { and, desc, eq } from 'drizzle-orm'

import {
  createGetContractorReceivingProfileUseCase,
  createSaveContractorReceivingProfileUseCase,
} from '../../src/cargo-receiving/application/contractor-receiving-profile.use-case.js'
import { createContractorPreviewEmailHttpRoutes } from '../../src/cargo-receiving/contractor-preview-email.composition.js'
import { DrizzleContractorPreviewEmailRepository } from '../../src/cargo-receiving/infrastructure/drizzle-contractor-preview-email.repository.js'
import { DrizzleContractorReceivingProfileRepository } from '../../src/cargo-receiving/infrastructure/drizzle-contractor-receiving-profile.repository.js'
import { createContractorReceivingProfileRoutes } from '../../src/cargo-receiving/presentation/contractor-receiving-profile.routes.js'
import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  cargoPreviewEmailIntakes,
  cargoPreviews,
  companies,
  contractorMailSettings,
  contractorReceivingProfiles,
  contractors,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDatabaseProvider>
type Seed = { readonly contractorId: string; readonly foreignContractorId: string }

const CLIENT_IP = '203.0.113.9'
const REPLY_DOMAIN = 'entrada.exemplo.test'
const LISTS = {
  forwarderAllowlist: ['equipe@transportadora.test'],
  senderAllowlist: ['contratante.test'],
}
const GENERATED_ACTION = 'contractor-receiving-profile.inbound-token-generated'
const ALLOWLISTS_ACTION = 'contractor-receiving-profile.preview-allowlists-saved'

const hashOf = (token: string): string =>
  createHash('sha256').update(`transportada:cargo-preview-inbound:v1:${token}`).digest('hex')

type Tokens = { readonly address: string; readonly token: string }

describe('a entrada da prévia por e-mail contra Postgres (spec 237 T4.6b)', () => {
  testWithPostgres(
    'gera o token uma vez, guarda só o hash e a leitura seguinte não o tem',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const handle = createHandler(database)
        const paths = pathsOf(seed.contractorId)

        const noLists = await handle(jsonRequest({ method: 'POST', path: paths.token }))
        expect(noLists.status).toBe(422)
        expect((await responseApiError(noLists)).code).toBe('RECEIVING_PROFILE_ALLOWLISTS_REQUIRED')

        await putLists(handle, paths, { ...LISTS, senderAllowlist: [] })
        const oneList = await handle(jsonRequest({ method: 'POST', path: paths.token }))
        expect(oneList.status).toBe(422)
        const refusal = (await oneList.json()) as {
          error: { details: readonly { field: string }[] }
        }
        expect(refusal.error.details.map((detail) => detail.field)).toEqual(['senderAllowlist'])
        expect(await storedHash(database, seed.contractorId)).toBeNull()

        expect((await putLists(handle, paths, LISTS)).status).toBe(200)
        const noDomain = await handle(jsonRequest({ method: 'POST', path: paths.token }))
        expect(noDomain.status).toBe(409)
        expect((await responseApiError(noDomain)).code).toBe(
          'RECEIVING_PROFILE_INBOUND_DOMAIN_NOT_CONFIGURED',
        )
        expect(await storedHash(database, seed.contractorId)).toBeNull()

        await seedReplyDomain(database)
        const generated = await handle(jsonRequest({ method: 'POST', path: paths.token }))
        expect(generated.status).toBe(200)
        expect(generated.headers.get('cache-control')).toBe('no-store')
        const { address, token } = await responseData<Tokens>(generated)
        expect(token).toMatch(/^[a-z2-7]{26}$/u)
        expect(address).toBe(`${token}@${REPLY_DOMAIN}`)

        expect(await storedHash(database, seed.contractorId)).toBe(hashOf(token))

        const afterwards = await Promise.all([
          handle(jsonRequest({ method: 'GET', path: paths.settings })),
          handle(jsonRequest({ method: 'GET', path: paths.profile })),
          handle(jsonRequest({ method: 'GET', path: `${paths.intakes}?limit=50` })),
        ])
        const bodies = await Promise.all(afterwards.map((response) => response.text()))
        for (const body of bodies) {
          expect(body).not.toContain(token)
          expect(body).not.toContain(hashOf(token))
        }
        const settings = (JSON.parse(bodies[0] ?? '{}') as { data: Record<string, unknown> }).data
        expect(settings).toMatchObject({ hasInboundToken: true, ...LISTS })
        expect(typeof settings.inboundTokenSetAt).toBe('string')
        expect(Object.keys(settings).sort()).toEqual([
          'contractorId',
          'forwarderAllowlist',
          'hasInboundToken',
          'inboundTokenSetAt',
          'senderAllowlist',
        ])
      })
    },
  )

  testWithPostgres(
    'rotacionar apaga o hash anterior: o worker não acha mais o endereço antigo',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const handle = createHandler(database)
        const paths = pathsOf(seed.contractorId)
        await seedReplyDomain(database)
        await putLists(handle, paths, LISTS)

        const first = await responseData<Tokens>(
          await handle(jsonRequest({ method: 'POST', path: paths.token })),
        )
        const second = await responseData<Tokens>(
          await handle(jsonRequest({ method: 'POST', path: paths.token })),
        )

        expect(second.token).not.toBe(first.token)
        expect(await storedHash(database, seed.contractorId)).toBe(hashOf(second.token))
        const lookups = await Promise.all(
          [first.token, second.token].map((token) =>
            database.db
              .select({ id: contractorReceivingProfiles.id })
              .from(contractorReceivingProfiles)
              .where(eq(contractorReceivingProfiles.previewInboundTokenHash, hashOf(token))),
          ),
        )
        expect(lookups.map((rows) => rows.length)).toEqual([0, 1])
      })
    },
  )

  testWithPostgres(
    'a auditoria nasce na mesma transação, com ator, alvo, IP e hora, sem token nem hash',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const handle = createHandler(database)
        const paths = pathsOf(seed.contractorId)
        await seedReplyDomain(database)
        await putLists(handle, paths, LISTS)
        const first = await responseData<Tokens>(
          await handle(jsonRequest({ method: 'POST', path: paths.token })),
        )
        const second = await responseData<Tokens>(
          await handle(jsonRequest({ method: 'POST', path: paths.token })),
        )

        const audits = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.action, GENERATED_ACTION))
          .orderBy(auditLogs.createdAt)
        expect(audits).toHaveLength(2)
        expect(
          audits.map((audit) => (audit.metadata as { isRotation: boolean }).isRotation),
        ).toEqual([false, true])
        for (const audit of audits) {
          expect(audit).toMatchObject({
            actorUserId: COMPANY_CONTEXT.userId,
            companyId: COMPANY_CONTEXT.companyId,
            correlationId: CORRELATION_ID,
            targetId: seed.contractorId,
            targetType: 'contractor',
          })
          expect((audit.metadata as { ipAddress: string }).ipAddress).toBe(CLIENT_IP)
          expect(audit.createdAt).toBeInstanceOf(Date)
        }
        const everything = JSON.stringify(await database.db.select().from(auditLogs))
        for (const secret of [
          first.token,
          second.token,
          hashOf(first.token),
          hashOf(second.token),
        ]) {
          expect(everything).not.toContain(secret)
        }
      })
    },
  )

  testWithPostgres('falha na auditoria desfaz a troca do hash', async () => {
    await withDisposableDatabase(async (database, seed) => {
      const handle = createHandler(database)
      const paths = pathsOf(seed.contractorId)
      await seedReplyDomain(database)
      await putLists(handle, paths, LISTS)
      const original = await responseData<Tokens>(
        await handle(jsonRequest({ method: 'POST', path: paths.token })),
      )
      const repository = new DrizzleContractorPreviewEmailRepository(database.db)

      const failure = await repository
        .rotateInboundToken({
          actor: {
            companyId: COMPANY_CONTEXT.companyId,
            correlationId: CORRELATION_ID,
            ipAddress: CLIENT_IP,
            userId: crypto.randomUUID(),
          },
          contractorId: seed.contractorId,
          tokenHash: hashOf('zzzzzzzzzzzzzzzzzzzzzzzzzz'),
        })
        .then(() => 'rotated')
        .catch(() => 'failed')

      expect(failure).toBe('failed')
      expect(await storedHash(database, seed.contractorId)).toBe(hashOf(original.token))
    })
  })

  testWithPostgres(
    'duas rotações ao mesmo tempo terminam com um hash só, o da última',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const handle = createHandler(database)
        const paths = pathsOf(seed.contractorId)
        await seedReplyDomain(database)
        await putLists(handle, paths, LISTS)

        const responses = await Promise.all([
          handle(jsonRequest({ method: 'POST', path: paths.token })),
          handle(jsonRequest({ method: 'POST', path: paths.token })),
        ])

        expect(responses.map((response) => response.status)).toEqual([200, 200])
        const hashes = (
          await Promise.all(responses.map((response) => responseData<Tokens>(response)))
        ).map((tokens) => hashOf(tokens.token))
        const stored = await storedHash(database, seed.contractorId)
        expect(hashes.includes(stored ?? '')).toBe(true)
        const audits = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.action, GENERATED_ACTION))
        expect(audits).toHaveLength(2)
      })
    },
  )
})

describe('as listas da prévia por e-mail contra Postgres (spec 237 T4.6b)', () => {
  testWithPostgres('grava normalizado, cria o perfil e só audita quando muda', async () => {
    await withDisposableDatabase(async (database, seed) => {
      const handle = createHandler(database)
      const paths = pathsOf(seed.contractorId)

      const saved = await putLists(handle, paths, {
        forwarderAllowlist: ['  Equipe@Transportadora.Test', 'equipe@transportadora.test'],
        senderAllowlist: ['Contratante.Test'],
      })
      expect(saved.status).toBe(200)
      expect(await responseData(saved)).toMatchObject({ ...LISTS, hasInboundToken: false })
      const [row] = await database.db.select().from(contractorReceivingProfiles)
      expect(row).toMatchObject({
        companyId: COMPANY_CONTEXT.companyId,
        isEnabled: false,
        previewForwarderAllowlist: LISTS.forwarderAllowlist,
        previewSenderAllowlist: LISTS.senderAllowlist,
      })

      await putLists(handle, paths, LISTS)
      expect(await countAudits(database, ALLOWLISTS_ACTION)).toBe(1)

      await putLists(handle, paths, {
        ...LISTS,
        senderAllowlist: ['contratante.test', 'outro.test'],
      })
      expect(await countAudits(database, ALLOWLISTS_ACTION)).toBe(2)
      const [audit] = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, ALLOWLISTS_ACTION))
        .orderBy(desc(auditLogs.createdAt))
        .limit(1)
      expect(audit?.metadata).toMatchObject({ ipAddress: CLIENT_IP })
      expect(JSON.stringify(audit)).not.toContain('Hash')
    })
  })

  testWithPostgres('o PUT do perfil existente não toca no endereço nem nas listas', async () => {
    await withDisposableDatabase(async (database, seed) => {
      const handle = createHandler(database)
      const paths = pathsOf(seed.contractorId)
      await seedReplyDomain(database)
      await putLists(handle, paths, LISTS)
      const { token } = await responseData<Tokens>(
        await handle(jsonRequest({ method: 'POST', path: paths.token })),
      )

      await handle(jsonRequest({ body: PROFILE_RULES, method: 'PUT', path: paths.profile }))

      expect(await storedHash(database, seed.contractorId)).toBe(hashOf(token))
      const [row] = await database.db.select().from(contractorReceivingProfiles)
      expect(row?.previewForwarderAllowlist).toEqual(LISTS.forwarderAllowlist)
    })
  })

  testWithPostgres('esvaziar uma lista com endereço ativo é 422 e nada muda', async () => {
    await withDisposableDatabase(async (database, seed) => {
      const handle = createHandler(database)
      const paths = pathsOf(seed.contractorId)
      await seedReplyDomain(database)
      await putLists(handle, paths, LISTS)
      await handle(jsonRequest({ method: 'POST', path: paths.token }))
      const before = await countAudits(database, ALLOWLISTS_ACTION)

      const refused = await putLists(handle, paths, { ...LISTS, senderAllowlist: [] })

      expect(refused.status).toBe(422)
      expect((await responseApiError(refused)).code).toBe('RECEIVING_PROFILE_ALLOWLISTS_REQUIRED')
      const [row] = await database.db.select().from(contractorReceivingProfiles)
      expect(row?.previewSenderAllowlist).toEqual(LISTS.senderAllowlist)
      expect(await countAudits(database, ALLOWLISTS_ACTION)).toBe(before)
    })
  })

  /** Revisão de segurança (L1): o CHECK conta caracteres; o que a política deixasse passar vira 422 estável, não 500. */
  testWithPostgres(
    'lista que o CHECK do banco recusa é um desfecho tipado, sem linha nem auditoria',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const repository = new DrizzleContractorPreviewEmailRepository(database.db)

        const outcome = await repository.saveAllowlists({
          actor: {
            companyId: COMPANY_CONTEXT.companyId,
            correlationId: CORRELATION_ID,
            ipAddress: CLIENT_IP,
            userId: COMPANY_CONTEXT.userId,
          },
          contractorId: seed.contractorId,
          forwarderAllowlist: ['a😀'],
          senderAllowlist: ['contratante.test'],
        })

        expect(outcome).toEqual({ status: 'allowlists_invalid' })
        expect(await database.db.select().from(contractorReceivingProfiles)).toEqual([])
        expect(await countAudits(database, ALLOWLISTS_ACTION)).toBe(0)
      })
    },
  )

  testWithPostgres('sem endereço ativo, esvaziar a lista a deixa nula', async () => {
    await withDisposableDatabase(async (database, seed) => {
      const handle = createHandler(database)
      const paths = pathsOf(seed.contractorId)
      await putLists(handle, paths, LISTS)

      const cleared = await putLists(handle, paths, { forwarderAllowlist: [], senderAllowlist: [] })

      expect(cleared.status).toBe(200)
      expect(await responseData(cleared)).toMatchObject({
        forwarderAllowlist: [],
        hasInboundToken: false,
        senderAllowlist: [],
      })
      const [row] = await database.db.select().from(contractorReceivingProfiles)
      expect(row).toMatchObject({ previewForwarderAllowlist: null, previewSenderAllowlist: null })
    })
  })
})

describe('o acesso à entrada da prévia por e-mail é da empresa do contexto (spec 237 T4.6b)', () => {
  testWithPostgres(
    'contratante de outra empresa é 404 nas quatro rotas e nada é gravado',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const handle = createHandler(database)
        const paths = pathsOf(seed.foreignContractorId)
        await seedReplyDomain(database)

        const responses = await Promise.all([
          handle(jsonRequest({ method: 'GET', path: paths.settings })),
          putLists(handle, paths, LISTS),
          handle(jsonRequest({ method: 'POST', path: paths.token })),
          handle(jsonRequest({ method: 'GET', path: paths.intakes })),
        ])

        expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404])
        expect(await database.db.select().from(contractorReceivingProfiles)).toEqual([])
        expect(await database.db.select().from(auditLogs)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'o domínio de entrada é o da empresa do contexto: o de outra empresa não vale',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const handle = createHandler(database)
        const paths = pathsOf(seed.contractorId)
        await putLists(handle, paths, LISTS)
        await seedReplyDomain(database, seed.foreignCompanyId)

        const refused = await handle(jsonRequest({ method: 'POST', path: paths.token }))

        expect(refused.status).toBe(409)
        expect(await storedHash(database, seed.contractorId)).toBeNull()
      })
    },
  )

  testWithPostgres(
    'só as recusas do contratante e da empresa, as mais novas primeiro',
    async () => {
      await withDisposableDatabase(async (database, seed) => {
        const handle = createHandler(database)
        const paths = pathsOf(seed.contractorId)
        const previewId = await seedPreview(database, seed.contractorId)
        await seedIntake(database, {
          contractorId: seed.contractorId,
          minutesAgo: 30,
          reasonCode: 'FORWARDER_NOT_ALLOWED',
        })
        await seedIntake(database, { contractorId: seed.contractorId, minutesAgo: 20, previewId })
        await seedIntake(database, {
          contractorId: seed.contractorId,
          minutesAgo: 10,
          reasonCode: 'RATE_LIMITED',
        })
        await seedIntake(database, {
          contractorId: seed.foreignContractorId,
          minutesAgo: 5,
          reasonCode: 'MIME_UNREADABLE',
          companyId: seed.foreignCompanyId,
        })

        const response = await handle(
          jsonRequest({ method: 'GET', path: `${paths.intakes}?limit=2` }),
        )

        const { data } = (await response.json()) as { data: Record<string, unknown>[] }
        expect(data.map((intake) => intake.reasonCode ?? intake.previewId)).toEqual([
          'RATE_LIMITED',
          previewId,
        ])
        expect(data.map((intake) => Object.keys(intake).sort())).toEqual([
          ['outcome', 'previewId', 'reasonCode', 'receivedAt'],
          ['outcome', 'previewId', 'reasonCode', 'receivedAt'],
        ])
        expect(data.map((intake) => intake.outcome)).toEqual(['rejected', 'accepted'])
      })
    },
  )
})

const PROFILE_RULES = {
  arrivalReferenceLabel: null,
  deliveryDeadlineBusinessDays: null,
  isEnabled: true,
  matchWindowDays: 15,
  previewColumnMap: null,
  previewEnabled: false,
  previewSheetName: null,
  requiresDamageCheck: false,
  separationWindowHours: 24,
  weightTolerancePercent: 0,
}

function pathsOf(contractorId: string) {
  const profile = `/contractors/${contractorId}/receiving-profile`
  return {
    intakes: `${profile}/email-intakes`,
    profile,
    settings: `${profile}/preview-email`,
    token: `${profile}/inbound-token`,
  }
}

function putLists(
  handle: (request: Request) => Promise<Response>,
  paths: ReturnType<typeof pathsOf>,
  body: unknown,
): Promise<Response> {
  return handle(jsonRequest({ body, method: 'PUT', path: paths.settings }))
}

function createHandler(database: TestDatabase): (request: Request) => Promise<Response> {
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: authenticatedContext(COMPANY_CONTEXT.permissions),
      routes: [
        ...createContractorPreviewEmailHttpRoutes({
          database: database.db,
          resolveClientIp: () => CLIENT_IP,
        }),
        ...profileRoutes(database),
      ],
    }),
  })
  return (request) => handleRequest(request, { timeout() {} })
}

async function storedHash(database: TestDatabase, contractorId: string): Promise<string | null> {
  const [row] = await database.db
    .select({ hash: contractorReceivingProfiles.previewInboundTokenHash })
    .from(contractorReceivingProfiles)
    .where(eq(contractorReceivingProfiles.contractorId, contractorId))
  return row?.hash ?? null
}

async function countAudits(database: TestDatabase, action: string): Promise<number> {
  const rows = await database.db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, action)))
  return rows.length
}

async function seedReplyDomain(
  database: TestDatabase,
  companyId: string = COMPANY_CONTEXT.companyId,
): Promise<void> {
  await database.db.insert(contractorMailSettings).values({
    companyId,
    replyDomain: REPLY_DOMAIN,
    secretEnvelope: {},
    senderAddress: `envio@${REPLY_DOMAIN}`,
    senderName: 'Transportadora',
  })
}

async function seedPreview(database: TestDatabase, contractorId: string): Promise<string> {
  const [row] = await database.db
    .insert(cargoPreviews)
    .values({
      companyId: COMPANY_CONTEXT.companyId,
      contractorId,
      fileName: 'previa.xlsx',
      fileObjectId: crypto.randomUUID(),
      fileSha256: 'a'.repeat(64),
      fileSizeBytes: 100,
      idempotencyKey: `email:${'b'.repeat(64)}`,
      receivedAt: new Date(),
      requestFingerprint: 'c'.repeat(64),
      source: 'email',
      uploadedByUserId: null,
    })
    .returning({ id: cargoPreviews.id })
  if (row === undefined) throw new Error('seed preview failed')
  return row.id
}

async function seedIntake(
  database: TestDatabase,
  input: {
    readonly companyId?: string
    readonly contractorId: string
    readonly minutesAgo: number
    readonly previewId?: string
    readonly reasonCode?: 'FORWARDER_NOT_ALLOWED' | 'MIME_UNREADABLE' | 'RATE_LIMITED'
  },
): Promise<void> {
  const moment = new Date(Date.now() - input.minutesAgo * 60_000)
  await database.db.insert(cargoPreviewEmailIntakes).values({
    companyId: input.companyId ?? COMPANY_CONTEXT.companyId,
    contractorId: input.contractorId,
    outcome: input.previewId === undefined ? 'rejected' : 'accepted',
    previewId: input.previewId ?? null,
    providerEmailId: crypto.randomUUID(),
    reasonCode: input.reasonCode ?? null,
    receivedAt: moment,
    recordedAt: moment,
  })
}

function profileRoutes(database: TestDatabase) {
  const repository = new DrizzleContractorReceivingProfileRepository(database.db)
  return createContractorReceivingProfileRoutes({
    getProfile: createGetContractorReceivingProfileUseCase({ repository }),
    saveProfile: createSaveContractorReceivingProfileUseCase({ repository }),
  })
}

async function withDisposableDatabase(
  operation: (
    database: TestDatabase,
    seed: Seed & { readonly foreignCompanyId: string },
  ) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pvwemail_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDatabaseProvider({
      pool: { connectTimeoutSeconds: 10, max: 4, queryTimeoutMs: 20_000 },
      url: disposableUrl.toString(),
    })
    await operation(database, await seedTenants(database))
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}

async function seedTenants(
  database: TestDatabase,
): Promise<Seed & { readonly foreignCompanyId: string }> {
  const foreignCompanyId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const foreignContractorId = crypto.randomUUID()
  await database.db.insert(companies).values([
    { id: COMPANY_CONTEXT.companyId, status: 'active' },
    { id: foreignCompanyId, status: 'active' },
  ])
  await database.db.insert(identityUsers).values({ id: COMPANY_CONTEXT.userId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId: COMPANY_CONTEXT.companyId,
    id: COMPANY_CONTEXT.membershipId,
    status: 'active',
    userId: COMPANY_CONTEXT.userId,
  })
  await database.db.insert(contractors).values([
    { companyId: COMPANY_CONTEXT.companyId, id: contractorId, taxId: '30290856000160' },
    { companyId: foreignCompanyId, id: foreignContractorId, taxId: '30290856000160' },
  ])
  return { contractorId, foreignCompanyId, foreignContractorId }
}
