/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createIdentityDocumentBackfillRoutine } from '../../src/identity-document-backfill/application/identity-document-backfill.routine.js'
import { IDENTITY_DOCUMENT_BACKFILL_JOB } from '../../src/identity-document-backfill/domain/identity-document-backfill.constant.js'
import type {
  LocalDocument,
  RealmUser,
} from '../../src/identity-document-backfill/application/identity-document.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

const CONTEXT = {
  correlationId: 'correlation-1',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: IDENTITY_DOCUMENT_BACKFILL_JOB,
  origin: 'schedule',
} as const

function realmUserOf(subject: string, taxId?: string): RealmUser {
  return {
    attributes: {
      company_id: COMPANY_ID,
      ...(taxId === undefined ? {} : { tax_id: [taxId] }),
    },
    subject,
  }
}

function createFakes(input: {
  readonly documents?: readonly LocalDocument[]
  readonly failListing?: boolean
  readonly failWrite?: boolean
  readonly pages?: readonly (readonly RealmUser[])[]
}) {
  const writes: { readonly attributes: unknown; readonly userId: string }[] = []
  const pages = input.pages ?? [[]]

  return {
    documents: {
      async findBySubjects() {
        return input.documents ?? []
      },
    },
    logger: { error() {}, info() {}, warn() {} } as never,
    realm: {
      async listUsers({ first, limit }: { readonly first: number; readonly limit: number }) {
        if (input.failListing === true) throw new Error('keycloak fora do ar')
        const index = Math.floor(first / limit)
        return { hasMore: index < pages.length - 1, users: pages[index] ?? [] }
      },
      async updateAttributes(call: { readonly attributes: unknown; readonly userId: string }) {
        if (input.failWrite === true) throw new Error('keycloak fora do ar')
        writes.push(call)
      },
    },
    writes,
  }
}

describe('backfill do documento — quem recebe o atributo', () => {
  test('escreve só em quem está sem documento no realm', async () => {
    const fakes = createFakes({
      documents: [{ companyId: COMPANY_ID, subject: 'sem-documento', taxId: '12345678909' }],
      pages: [[realmUserOf('com-documento', '98765432100'), realmUserOf('sem-documento')]],
    })

    const result = await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(fakes.writes).toHaveLength(1)
    expect(fakes.writes[0]?.userId).toBe('sem-documento')
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ examined: 2, written: 1 })
  })

  /**
   * O Admin API substitui o conjunto inteiro de atributos: sem a empresa junto, o backfill apagaria
   * o `company_id` e o login seguinte entraria sem empresa — trocaria um defeito por outro pior.
   */
  test('a empresa viaja junto do documento na escrita', async () => {
    const fakes = createFakes({
      documents: [{ companyId: COMPANY_ID, subject: 'pessoa', taxId: '12345678909' }],
      pages: [[realmUserOf('pessoa')]],
    })

    await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(fakes.writes[0]?.attributes).toEqual({
      company_id: COMPANY_ID,
      tax_id: '12345678909',
    })
  })

  /** Atributo presente e vazio é o mesmo que ausente: ninguém escreveu documento ali. */
  test('atributo vazio conta como ausente', async () => {
    const fakes = createFakes({
      documents: [{ companyId: COMPANY_ID, subject: 'pessoa', taxId: '12345678909' }],
      pages: [[realmUserOf('pessoa', '   ')]],
    })

    await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(fakes.writes).toHaveLength(1)
  })

  test('quem não tem documento na base não vira escrita', async () => {
    const fakes = createFakes({
      documents: [{ companyId: COMPANY_ID, subject: 'pessoa', taxId: '' }],
      pages: [[realmUserOf('pessoa')]],
    })

    const result = await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(fakes.writes).toHaveLength(0)
    expect(result.outcome).toBe('succeeded')
  })

  test('realm inteiro já preenchido fecha o ciclo em zero', async () => {
    const fakes = createFakes({ pages: [[realmUserOf('pessoa', '12345678909')]] })

    const result = await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(result.counters).toMatchObject({ written: 0 })
    expect(result.outcome).toBe('succeeded')
  })
})

describe('backfill do documento — quando o provedor cai', () => {
  /**
   * A falha domina o ciclo. Uma passada que escreveu metade e diz "concluído" faria a próxima
   * janela seguir em frente, e quem ficou de fora nunca mais seria alcançado.
   */
  test('provedor fora do ar na leitura é falha nomeada, não sucesso', async () => {
    const fakes = createFakes({ failListing: true })

    const result = await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(result.outcome).toBe('identity_provider_unreachable')
  })

  test('provedor fora do ar na escrita também derruba o ciclo', async () => {
    const fakes = createFakes({
      documents: [{ companyId: COMPANY_ID, subject: 'pessoa', taxId: '12345678909' }],
      failWrite: true,
      pages: [[realmUserOf('pessoa')]],
    })

    const result = await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(result.outcome).toBe('identity_provider_unreachable')
  })
})

describe('backfill do documento — o recorte do ciclo', () => {
  test('segue para a página seguinte enquanto o realm disser que há mais', async () => {
    const fakes = createFakes({
      documents: [{ companyId: COMPANY_ID, subject: 'a', taxId: '12345678909' }],
      pages: [[realmUserOf('a')], [realmUserOf('b', '98765432100')]],
    })

    const result = await createIdentityDocumentBackfillRoutine(fakes).run(CONTEXT)

    expect(result.counters).toMatchObject({ examined: 2, pages: 2 })
  })

  test('parada pedida pelo operador encerra o ciclo sem escrever mais', async () => {
    const fakes = createFakes({
      documents: [{ companyId: COMPANY_ID, subject: 'pessoa', taxId: '12345678909' }],
      pages: [[realmUserOf('pessoa')]],
    })

    const result = await createIdentityDocumentBackfillRoutine(fakes).run({
      ...CONTEXT,
      isStopRequested: () => true,
    })

    expect(fakes.writes).toHaveLength(0)
    expect(result.counters).toMatchObject({ pages: 0 })
  })
})
