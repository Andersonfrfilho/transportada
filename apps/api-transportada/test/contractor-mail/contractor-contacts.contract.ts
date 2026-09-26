/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T301 (spec 143 T013): CRUD de `contractor_contacts` dentro de `/contractors/:id`. Dois
 * níveis: o caso de uso (BOLA por `getContractor`, normalização de e-mail, mapeamento de
 * not-found) e as rotas (permissão, status code, serialização). A integração contra Postgres de
 * verdade (unique de `(company_id, contractor_id, lower(email))`, isolamento por tenant) está em
 * `test/integration/contractor-contacts-repository.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import {
  createContractorContactsUseCase,
  toContractorContact,
} from '../../src/contractor-mail/application/contractor-contacts.use-case.js'
import type {
  ContractorContact,
  ContractorContactsUseCase,
} from '../../src/contractor-mail/application/contractor-contacts.use-case.js'
import type {
  ContractorContactRecord,
  ContractorMailRepositoryPort,
  CreateContractorContactInput,
  UpdateContractorContactInput,
} from '../../src/contractor-mail/application/contractor-mail.port.js'
import {
  ContractorContactEmailTakenError,
  ContractorContactNotFoundError,
} from '../../src/contractor-mail/domain/contractor-mail.error.js'
import { createContractorContactRoutes } from '../../src/contractor-mail/presentation/contractor-contacts.routes.js'
import { ContractorNotFoundError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter, type defineRoute } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { HealthService } from '../../src/health/health.service.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from '../fixtures/nfe-import-application.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000e1'
const CONTRACTOR_ID = '00000000-0000-4000-8000-0000000000e3'
const CONTACT_ID = '00000000-0000-4000-8000-0000000000e4'

const CONTACT_RECORD: ContractorContactRecord = {
  canDecide: false,
  companyId: COMPANY_ID,
  contractorId: CONTRACTOR_ID,
  email: 'contato@example.com.br',
  id: CONTACT_ID,
  name: '',
  occurrenceStages: ['separation', 'delivery', 'stop'],
  phone: null,
  preferredChannel: 'email',
  receivesOccurrences: true,
  roleLabel: '',
  status: 'active',
  types: ['occurrences'],
  whatsappOptInAt: null,
  whatsappOptInByUserId: null,
}

const NOW = new Date('2026-09-24T18:00:00.000Z')
const ACTOR_USER_ID = NFE_COMPANY_CONTEXT.userId

const OPTED_IN_RECORD: ContractorContactRecord = {
  ...CONTACT_RECORD,
  canDecide: true,
  name: 'Compradora Souza',
  phone: '5511999990001',
  preferredChannel: 'whatsapp',
  types: ['occurrences', 'approves_charges'],
  whatsappOptInAt: new Date('2026-09-20T10:00:00.000Z'),
  whatsappOptInByUserId: '00000000-0000-4000-8000-0000000000a2',
}

describe('contractor contacts use case (spec 150 T301, spec 143 T013)', () => {
  test('lists contacts only after confirming the contractor belongs to the company (BOLA)', async () => {
    const getContractorCalls: unknown[] = []
    const useCase = buildUseCase({
      getContractor: async (input) => {
        getContractorCalls.push(input)
      },
      repository: buildRepository({ contacts: [CONTACT_RECORD] }),
    })

    const contacts = await useCase.list({
      context: contextOf(COMPANY_ID),
      contractorId: CONTRACTOR_ID,
    })

    expect(getContractorCalls).toHaveLength(1)
    expect(contacts).toEqual([toContact(CONTACT_RECORD)])
  })

  test('a contractor from another company answers 404, exactly like a nonexistent one', async () => {
    const useCase = buildUseCase({
      getContractor: async () => {
        throw new ContractorNotFoundError()
      },
      repository: buildRepository({}),
    })

    await expect(
      useCase.list({ context: contextOf(COMPANY_ID), contractorId: CONTRACTOR_ID }),
    ).rejects.toBeInstanceOf(ContractorNotFoundError)
  })

  test('normalizes the email (trims and lowercases) before creating the contact', async () => {
    const createCalls: CreateContractorContactInput[] = []
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({ createCalls }),
    })

    await useCase.create({
      canDecide: false,
      context: contextOf(COMPANY_ID),
      contractorId: CONTRACTOR_ID,
      email: '  Contato@Example.com.BR  ',
      receivesOccurrences: true,
    })

    expect(createCalls[0]?.email).toBe('contato@example.com.br')
  })

  test('a duplicate email propagates as the stable 409 code', async () => {
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({ createError: new ContractorContactEmailTakenError() }),
    })

    await expect(
      useCase.create({
        canDecide: false,
        context: contextOf(COMPANY_ID),
        contractorId: CONTRACTOR_ID,
        email: 'contato@example.com.br',
        receivesOccurrences: true,
      }),
    ).rejects.toBeInstanceOf(ContractorContactEmailTakenError)
  })

  test('updating a contact that does not exist in this contractor answers 404', async () => {
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({ updateResult: undefined }),
    })

    await expect(
      useCase.update({
        contactId: CONTACT_ID,
        context: contextOf(COMPANY_ID),
        contractorId: CONTRACTOR_ID,
        status: 'inactive',
      }),
    ).rejects.toBeInstanceOf(ContractorContactNotFoundError)
  })

  test('deactivating is a PATCH to status inactive, never a physical delete', async () => {
    const updateCalls: UpdateContractorContactInput[] = []
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({
        updateCalls,
        updateResult: { ...CONTACT_RECORD, status: 'inactive' },
      }),
    })

    const updated = await useCase.update({
      contactId: CONTACT_ID,
      context: contextOf(COMPANY_ID),
      contractorId: CONTRACTOR_ID,
      status: 'inactive',
    })

    expect(updateCalls[0]).toMatchObject({ contactId: CONTACT_ID, status: 'inactive' })
    expect(updated.status).toBe('inactive')
  })
})

/**
 * Spec 183 T302 (RF5, D6): a escrita passa pela política — os campos antigos saem dos tipos, o
 * aceite é carimbado com o relógio e o usuário do contexto, e o `PATCH` decide a partir do contato
 * atual, que é lido dentro da contratante e da empresa.
 */
describe('contractor contacts use case — tipos e canais (spec 183 T302)', () => {
  test('create deriva os campos antigos dos tipos e carimba o aceite com o usuário do contexto', async () => {
    const createCalls: CreateContractorContactInput[] = []
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({ createCalls }),
    })

    await useCase.create({
      context: contextOf(COMPANY_ID),
      contractorId: CONTRACTOR_ID,
      email: 'compras@example.com.br',
      name: 'Compradora Souza',
      phone: '(11) 99999-0001',
      preferredChannel: 'whatsapp',
      types: ['approves_charges'],
      whatsappOptIn: true,
    })

    expect(createCalls[0]).toMatchObject({
      canDecide: true,
      name: 'Compradora Souza',
      phone: '5511999990001',
      preferredChannel: 'whatsapp',
      receivesOccurrences: false,
      types: ['approves_charges'],
      whatsappOptInAt: NOW,
      whatsappOptInByUserId: ACTOR_USER_ID,
    })
  })

  test('create recusado pela política é 422 com o código dela, sem tocar o repositório', async () => {
    const createCalls: CreateContractorContactInput[] = []
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({ createCalls }),
    })

    const failure = await useCase
      .create({
        context: contextOf(COMPANY_ID),
        contractorId: CONTRACTOR_ID,
        email: 'compras@example.com.br',
        phone: '11999990001',
        preferredChannel: 'whatsapp',
      })
      .catch((error: unknown) => error)

    expect(failure).toMatchObject({
      code: 'CONTRACTOR_CONTACT_WHATSAPP_WITHOUT_OPT_IN',
      status: 422,
    })
    expect(createCalls).toEqual([])
  })

  test('update parte do contato atual: o mesmo número guarda o carimbo do aceite', async () => {
    const updateCalls: UpdateContractorContactInput[] = []
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({
        findResult: OPTED_IN_RECORD,
        updateCalls,
        updateResult: OPTED_IN_RECORD,
      }),
    })

    await useCase.update({
      contactId: CONTACT_ID,
      context: contextOf(COMPANY_ID),
      contractorId: CONTRACTOR_ID,
      phone: '+55 11 99999-0001',
      roleLabel: 'Compras',
    })

    expect(updateCalls[0]).toMatchObject({
      phone: '5511999990001',
      roleLabel: 'Compras',
      whatsappOptInAt: OPTED_IN_RECORD.whatsappOptInAt,
      whatsappOptInByUserId: OPTED_IN_RECORD.whatsappOptInByUserId,
    })
  })

  test('update de contato que não existe nesta contratante é 404 antes da política', async () => {
    const updateCalls: UpdateContractorContactInput[] = []
    const useCase = buildUseCase({
      getContractor: async () => {},
      repository: buildRepository({ findResult: undefined, updateCalls }),
    })

    await expect(
      useCase.update({
        contactId: CONTACT_ID,
        context: contextOf(COMPANY_ID),
        contractorId: CONTRACTOR_ID,
        name: 'Qualquer',
      }),
    ).rejects.toBeInstanceOf(ContractorContactNotFoundError)
    expect(updateCalls).toEqual([])
  })
})

describe('contractor contacts routes (spec 150 T301, spec 143 T013)', () => {
  test('GET requires settings.manage', async () => {
    const { handle } = await createHttpFixture({ permissions: new Set(['invoices.read']) })
    const response = await handle(getRequest(`/contractors/${CONTRACTOR_ID}/contacts`))
    expect(response.status).toBe(403)
  })

  test('GET lists the contacts of the contractor with no-store', async () => {
    const { handle } = await createHttpFixture({ contacts: [CONTACT_RECORD] })
    const response = await handle(getRequest(`/contractors/${CONTRACTOR_ID}/contacts`))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as { data: unknown }
    expect(body.data).toEqual([toSerializedContact(CONTACT_RECORD)])
  })

  test('POST rejects a malformed email', async () => {
    const { handle } = await createHttpFixture({})
    const response = await handle(
      jsonRequest({
        body: { email: 'not-an-email' },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )
    expect(response.status).toBe(400)
  })

  /**
   * Revisão final, item de segurança B1: `contractor_contacts.email` é `text()` sem teto no banco —
   * sem limite na fronteira, um corpo com um e-mail gigante chegaria até a query. 254 é o teto
   * prático de e-mail (RFC 5321 §4.5.3.1.3), a mesma constante do CHECK novo na migration.
   */
  test('POST rejects an email longer than 254 characters', async () => {
    const { handle } = await createHttpFixture({})
    const oversized = `${'a'.repeat(250)}@example.com`
    expect(oversized.length).toBeGreaterThan(254)
    const response = await handle(
      jsonRequest({
        body: { email: oversized },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )
    expect(response.status).toBe(400)
  })

  test('POST creates the contact and answers 201', async () => {
    const createCalls: unknown[] = []
    const { handle } = await createHttpFixture({ createCalls })
    const response = await handle(
      jsonRequest({
        body: { email: 'novo@example.com.br', receivesOccurrences: true },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )

    expect(response.status).toBe(201)
    expect(createCalls).toHaveLength(1)
  })

  test('POST propagates a duplicate email as 409 CONTRACTOR_CONTACT_EMAIL_TAKEN', async () => {
    const { handle } = await createHttpFixture({
      createError: new ContractorContactEmailTakenError(),
    })
    const response = await handle(
      jsonRequest({
        body: { email: 'contato@example.com.br' },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )

    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('CONTRACTOR_CONTACT_EMAIL_TAKEN')
  })

  test('a contractor from another company answers 404 on every route (BOLA)', async () => {
    const { handle } = await createHttpFixture({
      getContractorError: new ContractorNotFoundError(),
    })

    const listResponse = await handle(getRequest(`/contractors/${CONTRACTOR_ID}/contacts`))
    expect(listResponse.status).toBe(404)

    const patchResponse = await handle(
      jsonRequest({
        body: { status: 'inactive' },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}/contacts/${CONTACT_ID}`,
      }),
    )
    expect(patchResponse.status).toBe(404)
  })

  test('PATCH deactivates the contact without a physical delete route existing', async () => {
    const updateCalls: unknown[] = []
    const { handle } = await createHttpFixture({
      updateCalls,
      updateResult: { ...CONTACT_RECORD, status: 'inactive' },
    })
    const response = await handle(
      jsonRequest({
        body: { status: 'inactive' },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}/contacts/${CONTACT_ID}`,
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { status: string } }
    expect(body.data.status).toBe('inactive')
    expect(updateCalls).toHaveLength(1)
  })

  /**
   * Revisão final, item [BAIXO]: mesmo contrato do envio de correção (`mail-routes.contract.ts`,
   * "never logs the recipient email...") — nenhum e-mail de contato aparece em log, no caminho de
   * sucesso nem no de erro.
   */
  test('never logs a contact email, on POST, PATCH or a duplicate-email failure', async () => {
    const logCalls: { readonly message: string; readonly metadata: unknown }[] = []
    const { handle } = await createHttpFixture({
      createError: new ContractorContactEmailTakenError(),
      logCalls,
    })

    await handle(
      jsonRequest({
        body: { email: 'segredo-do-financeiro@contratante.example' },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )
    await handle(
      jsonRequest({
        body: { email: 'outro-segredo@contratante.example' },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}/contacts/${CONTACT_ID}`,
      }),
    )

    const serialized = JSON.stringify(logCalls)
    expect(serialized).not.toContain('segredo-do-financeiro@contratante.example')
    expect(serialized).not.toContain('outro-segredo@contratante.example')
  })

  test('PATCH rejects an email longer than 254 characters', async () => {
    const { handle } = await createHttpFixture({})
    const oversized = `${'a'.repeat(250)}@example.com`
    const response = await handle(
      jsonRequest({
        body: { email: oversized },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}/contacts/${CONTACT_ID}`,
      }),
    )
    expect(response.status).toBe(400)
  })
})

describe('contractor contacts routes — tipos e canais (spec 183 T302)', () => {
  test('POST aceita os campos novos e responde com eles, o aceite carimbado pelo servidor', async () => {
    const { handle } = await createHttpFixture({})
    const response = await handle(
      jsonRequest({
        body: {
          email: 'compras@example.com.br',
          name: 'Compradora Souza',
          occurrenceStages: ['delivery'],
          phone: '11999990001',
          preferredChannel: 'whatsapp',
          roleLabel: 'Compras',
          types: ['occurrences', 'approves_charges'],
          whatsappOptIn: true,
        },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(body.data).toEqual({
      canDecide: true,
      contractorId: CONTRACTOR_ID,
      email: 'compras@example.com.br',
      id: CONTACT_ID,
      name: 'Compradora Souza',
      occurrenceStages: ['delivery'],
      phone: '5511999990001',
      preferredChannel: 'whatsapp',
      receivesOccurrences: true,
      roleLabel: 'Compras',
      status: 'active',
      types: ['occurrences', 'approves_charges'],
      whatsappOptInAt: NOW.toISOString(),
      whatsappOptInByUserId: ACTOR_USER_ID,
    })
  })

  test('o cliente não carimba o aceite: whatsappOptInAt no corpo é 400', async () => {
    const createCalls: unknown[] = []
    const { handle } = await createHttpFixture({ createCalls })
    const response = await handle(
      jsonRequest({
        body: {
          email: 'compras@example.com.br',
          phone: '11999990001',
          whatsappOptInAt: '2020-01-01T00:00:00.000Z',
        },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )

    expect(response.status).toBe(400)
    expect(createCalls).toEqual([])
  })

  test('tipo ou grupo fora da lista fechada é 400', async () => {
    const { handle } = await createHttpFixture({})
    for (const body of [
      { email: 'a@example.com.br', types: ['marketing'] },
      { email: 'a@example.com.br', occurrenceStages: ['warehouse'] },
      { email: 'a@example.com.br', preferredChannel: 'sms' },
    ]) {
      const response = await handle(
        jsonRequest({ body, method: 'POST', path: `/contractors/${CONTRACTOR_ID}/contacts` }),
      )
      expect(response.status).toBe(400)
    }
  })

  test('recusa da política vira 422 com o código estável', async () => {
    const { handle } = await createHttpFixture({})
    const response = await handle(
      jsonRequest({
        body: { email: 'a@example.com.br', receivesOccurrences: true, types: ['invoices'] },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )

    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('CONTRACTOR_CONTACT_TYPES_CONFLICT')
  })

  test('PATCH aceita tirar o telefone com null', async () => {
    const updateCalls: unknown[] = []
    const { handle } = await createHttpFixture({ updateCalls })
    const response = await handle(
      jsonRequest({
        body: { phone: null },
        method: 'PATCH',
        path: `/contractors/${CONTRACTOR_ID}/contacts/${CONTACT_ID}`,
      }),
    )

    expect(response.status).toBe(200)
    expect(updateCalls[0]).toMatchObject({ phone: null })
  })

  test('nunca loga telefone nem nome do contato', async () => {
    const logCalls: { readonly message: string; readonly metadata: unknown }[] = []
    const { handle } = await createHttpFixture({ logCalls })

    await handle(
      jsonRequest({
        body: { email: 'a@example.com.br', name: 'Nome Sigiloso', phone: '1234' },
        method: 'POST',
        path: `/contractors/${CONTRACTOR_ID}/contacts`,
      }),
    )

    const serialized = JSON.stringify(logCalls)
    expect(serialized).not.toContain('Nome Sigiloso')
    expect(serialized).not.toContain('1234')
  })
})

type ContactRepositoryPort = Pick<
  ContractorMailRepositoryPort,
  | 'createContractorContact'
  | 'findContractorContact'
  | 'listContractorContacts'
  | 'updateContractorContact'
>

function buildUseCase(input: {
  readonly getContractor: (input: {
    readonly context: CompanyContext
    readonly id: string
  }) => Promise<unknown>
  readonly repository: ContactRepositoryPort
}): ContractorContactsUseCase {
  return createContractorContactsUseCase({
    getContractor: { execute: input.getContractor },
    now: () => NOW,
    repository: input.repository,
  })
}

function buildRepository(input: {
  readonly contacts?: readonly ContractorContactRecord[]
  readonly createCalls?: CreateContractorContactInput[]
  readonly createError?: Error
  readonly findResult?: ContractorContactRecord | undefined
  readonly updateCalls?: UpdateContractorContactInput[]
  readonly updateResult?: ContractorContactRecord | undefined
}): ContactRepositoryPort {
  return {
    async createContractorContact(create) {
      input.createCalls?.push(create)
      if (input.createError !== undefined) throw input.createError
      return { ...CONTACT_RECORD, ...create }
    },
    async findContractorContact() {
      return 'findResult' in input ? input.findResult : CONTACT_RECORD
    },
    async listContractorContacts() {
      return input.contacts ?? []
    },
    async updateContractorContact(update) {
      input.updateCalls?.push(update)
      return input.updateResult
    },
  }
}

function contextOf(companyId: string): CompanyContext {
  return { ...NFE_COMPANY_CONTEXT, companyId, permissions: new Set(['settings.manage']) }
}

/** O mesmo mapeador do caso de uso: o teste compara o domínio, não refaz a lista de campos. */
function toContact(record: ContractorContactRecord): ContractorContact {
  return toContractorContact(record)
}

function toSerializedContact(record: ContractorContactRecord): Record<string, unknown> {
  return {
    canDecide: record.canDecide,
    contractorId: record.contractorId,
    email: record.email,
    id: record.id,
    name: record.name,
    occurrenceStages: record.occurrenceStages,
    phone: record.phone,
    preferredChannel: record.preferredChannel,
    receivesOccurrences: record.receivesOccurrences,
    roleLabel: record.roleLabel,
    status: record.status,
    types: record.types,
    whatsappOptInAt: record.whatsappOptInAt?.toISOString() ?? null,
    whatsappOptInByUserId: record.whatsappOptInByUserId,
  }
}

type RegisteredRoute = ReturnType<typeof defineRoute>

async function createHttpFixture(params: {
  readonly contacts?: readonly ContractorContactRecord[]
  readonly createCalls?: unknown[]
  readonly createError?: Error
  readonly getContractorError?: Error
  readonly logCalls?: { readonly message: string; readonly metadata: unknown }[]
  readonly permissions?: CompanyContext['permissions']
  readonly updateCalls?: unknown[]
  readonly updateResult?: ContractorContactRecord | undefined
}): Promise<{ readonly handle: (request: Request) => Promise<Response> }> {
  const useCase = createContractorContactsUseCase({
    getContractor: {
      execute: async () => {
        if (params.getContractorError !== undefined) throw params.getContractorError
      },
    },
    now: () => NOW,
    repository: buildRepository({
      ...(params.contacts === undefined ? {} : { contacts: params.contacts }),
      ...(params.createCalls === undefined
        ? {}
        : { createCalls: params.createCalls as CreateContractorContactInput[] }),
      ...(params.createError === undefined ? {} : { createError: params.createError }),
      ...(params.updateCalls === undefined
        ? {}
        : { updateCalls: params.updateCalls as UpdateContractorContactInput[] }),
      updateResult: params.updateResult ?? CONTACT_RECORD,
    }),
  })

  const routes: readonly RegisteredRoute[] = createContractorContactRoutes({
    createContact: { execute: (input) => useCase.create(input) },
    listContacts: { execute: (input) => useCase.list(input) },
    updateContact: { execute: (input) => useCase.update(input) },
  })

  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'contractor-contacts-contract',
      userId: NFE_COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: contextOf(COMPANY_ID),
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: {
      async authenticate() {
        return context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        authorization.authorize(value, policy)
      },
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes,
    tenantContext: {
      async resolveCompany() {
        return {
          ...context,
          scope: { ...context.scope, permissions: params.permissions ?? context.scope.permissions },
        }
      },
    },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'contractor-contacts-http-correlation',
    frontendOrigins: ['http://localhost:53000'],
    logger: {
      error: (message, metadata) => params.logCalls?.push({ message, metadata }),
      info: (message, metadata) => params.logCalls?.push({ message, metadata }),
      warn: (message, metadata) => params.logCalls?.push({ message, metadata }),
    },
    requestTimeoutSeconds: 10,
    router,
  })

  return { handle: (request) => handleRequest(request, { timeout() {} }) }
}

function getRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer contractor-contacts-contract' },
  })
}

function jsonRequest(input: {
  readonly body: unknown
  readonly method: string
  readonly path: string
}): Request {
  return new Request(`http://localhost${input.path}`, {
    body: JSON.stringify(input.body),
    headers: {
      authorization: 'Bearer contractor-contacts-contract',
      'content-type': 'application/json',
    },
    method: input.method,
  })
}
