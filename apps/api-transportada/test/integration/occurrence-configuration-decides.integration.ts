/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.5 (CA03), contra Postgres real: só a configuração decide. Quatro tipos pelo caminho real
 * do motorista (`registerDriverOccurrence` + repositórios Drizzle) — dois com o MESMO nome em empresas
 * diferentes (o nome é único por empresa) e configuração diferente, dois com nomes diferentes e a MESMA
 * configuração. A exigência efetiva (tipo + exceção do contratante lida da nota), o que fica gravado, a
 * soma e o e-mail montado das linhas gravadas seguem a configuração; o nome não entra.
 */
import { describe, expect, test } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import { contractors } from '../../src/database/delivery-client.schema.js'
import { nfeParticipants, nfeProducts } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import { resolveOccurrenceAmounts } from '../../src/trips/domain/occurrence-amount.policy.js'
import {
  buildOccurrenceItemValues,
  renderOccurrenceTemplate,
} from '../../src/trips/domain/occurrence-template.policy.js'
import type { OccurrenceTemplateLine } from '../../src/trips/domain/occurrence-template.types.js'
import { registerStreetOccurrence } from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedTrip,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '30290856000160'
const RECIPIENT_TAX_ID = '12345678000190'
const REFERENCE_NUMBER = 'NFD 45029'
const REFERENCE_NUMBER_REQUIRED = 'TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED'
const DECLARED_AMOUNT_REQUIRED = 'TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED'
const NAME_PARTIAL_RETURN = 'Devolução parcial'
const NAME_EXTENSION = 'Prorrogação'
const NAME_TOTAL_RETURN = 'Devolução total'
const EMAIL_SUBJECT = 'Retorno {{numeroNotaSemSerie}}'
const EMAIL_BODY =
  'NFD {{numeroReferencia}}\n{{linhasItens}}\nPago {{valorDeclarado}} de {{somaItens}}'
const EMAIL_ITEM_LINE = '{{codigoItem}} {{quantidadeItem}} {{unidadeItem}} = {{valorItem}}'
const LOOSE_EMAIL_BODY = 'Aviso: {{observacao}}'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type World = {
  readonly company: Company
  readonly contractorId: string
  readonly trip: SeededTrip
}

type TypeSeed = {
  readonly isStrict: boolean
  readonly name: string
  readonly world: World
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  const documentId = row.nfeDocumentId
  const base = { cfop: '5102', companyId: company.companyId, documentId, ncm: '19053100' }
  await database.db.insert(nfeProducts).values([
    {
      ...base,
      code: 'P1',
      commercialUnit: 'CX',
      description: 'Biscoito',
      ordinal: 1n,
      quantity: '3.0000',
      totalValue: '59.9850',
      unitValue: '19.9950',
    },
    {
      ...base,
      code: 'P2',
      commercialUnit: 'UN',
      description: 'Bolo',
      ordinal: 2n,
      quantity: '1.0000',
      totalValue: '57.2000',
      unitValue: '57.2000',
    },
  ])
  await database.db.insert(nfeParticipants).values([
    { companyId: company.companyId, documentId, role: 'emitter', taxId: EMITTER_TAX_ID },
    {
      companyId: company.companyId,
      documentId,
      legalName: 'Destinatário',
      role: 'recipient',
      taxId: RECIPIENT_TAX_ID,
    },
  ])
  return { company, contractorId, trip }
}

async function seedType(database: TestDatabase, seed: TypeSeed): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    allowsMultipleItems: seed.isStrict,
    companyId: seed.world.company.companyId,
    declaredAmountMode: seed.isStrict ? 'required' : 'off',
    declaredAmountScope: seed.isStrict ? 'item' : 'occurrence',
    emailBody: seed.isStrict ? EMAIL_BODY : LOOSE_EMAIL_BODY,
    emailItemLineTemplate: seed.isStrict ? EMAIL_ITEM_LINE : '{{item}}',
    emailSubject: seed.isStrict ? EMAIL_SUBJECT : 'Aviso {{numeroNota}}',
    id,
    itemsMinimumCount: seed.isStrict ? 1 : null,
    itemsMode: seed.isStrict ? 'required' : 'optional',
    name: seed.name,
    referenceNumberMode: seed.isStrict ? 'required' : 'off',
    stage: 'delivery',
  })
  return id
}

type Subject = {
  readonly id: string
  readonly isStrict: boolean
  readonly world: World
}

async function seedSubject(database: TestDatabase, seed: TypeSeed): Promise<Subject> {
  return { id: await seedType(database, seed), isStrict: seed.isStrict, world: seed.world }
}

const FULL_ITEMS = [
  { declaredAmount: '25.00', productCode: 'P1', quantity: '2' },
  { declaredAmount: '57.20', productCode: 'P2', quantity: '1' },
] as const

type Outcome = { readonly code: string; readonly field: string }

const SAVED_OUTCOME: Outcome = { code: 'saved', field: '' }

function registerFor(
  database: TestDatabase,
  subject: Subject,
  input: { readonly referenceNumber?: string; readonly withAmounts?: boolean },
) {
  return registerStreetOccurrence(database, {
    attachmentObjectId: null,
    company: subject.world.company,
    items: input.withAmounts === true ? FULL_ITEMS : [{ productCode: 'P1', quantity: '2' }],
    trip: subject.world.trip,
    typeId: subject.id,
    ...(input.referenceNumber === undefined ? {} : { referenceNumber: input.referenceNumber }),
  })
}

async function outcomeOf(
  database: TestDatabase,
  subject: Subject,
  input: { readonly referenceNumber?: string; readonly withAmounts?: boolean },
): Promise<Outcome> {
  try {
    await registerFor(database, subject, input)
    return SAVED_OUTCOME
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    return { code: error.code, field: error.details?.[0]?.field ?? '' }
  }
}

async function readStored(database: TestDatabase, occurrenceId: string) {
  const [occurrence] = await database.db
    .select({
      declaredAmount: tripDocumentOccurrences.declaredAmount,
      note: tripDocumentOccurrences.note,
      referenceNumber: tripDocumentOccurrences.referenceNumber,
    })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.id, occurrenceId))
  const lines = await database.db
    .select({
      declaredAmount: tripDocumentOccurrenceProducts.declaredAmount,
      productCode: tripDocumentOccurrenceProducts.productCode,
      quantity: tripDocumentOccurrenceProducts.quantity,
      quantityUnit: tripDocumentOccurrenceProducts.quantityUnit,
      unitValue: tripDocumentOccurrenceProducts.unitValue,
    })
    .from(tripDocumentOccurrenceProducts)
    .where(eq(tripDocumentOccurrenceProducts.occurrenceId, occurrenceId))
    .orderBy(asc(tripDocumentOccurrenceProducts.position))
  if (occurrence === undefined) throw new Error('Occurrence vanished')
  return { lines, occurrence }
}

const DESCRIPTIONS: Readonly<Record<string, string>> = { P1: 'Biscoito', P2: 'Bolo' }

type StoredOccurrence = Awaited<ReturnType<typeof readStored>>

/** A conta e o e-mail saem só das linhas gravadas e do texto do tipo, como no envio. */
function summarize(stored: StoredOccurrence, isStrict: boolean) {
  const lines: readonly OccurrenceTemplateLine[] = stored.lines.map((line) => ({
    code: line.productCode,
    declaredAmount: line.declaredAmount,
    description: DESCRIPTIONS[line.productCode] ?? '',
    nfeQuantity: line.quantity ?? '0',
    quantity: line.quantity,
    totalValue: '0',
    unit: line.quantityUnit ?? '',
    unitValue: line.unitValue ?? '0',
  }))
  const amounts = resolveOccurrenceAmounts({
    declaredAmount: stored.occurrence.declaredAmount,
    lines,
  })
  const values = {
    contractorName: 'Contratante',
    declaredAmount: stored.occurrence.declaredAmount,
    documentLabel: '123/1',
    documentNumber: '123',
    driverName: 'Motorista',
    ...buildOccurrenceItemValues(
      lines.map((line) => ({
        code: line.code,
        description: line.description,
        quantity: line.quantity ?? line.nfeQuantity,
      })),
    ),
    itemLineTemplate: isStrict ? EMAIL_ITEM_LINE : '{{item}}',
    lines,
    note: stored.occurrence.note,
    occurredOn: '01/01/2026',
    recipientName: 'Destinatário',
    referenceNumber: stored.occurrence.referenceNumber ?? undefined,
    stopLabel: 'Rua',
    totalValue: '0',
  }
  return {
    declaredAmountCents: amounts.declaredAmountCents,
    email: renderOccurrenceTemplate({ template: isStrict ? EMAIL_BODY : LOOSE_EMAIL_BODY, values }),
    itemsSumCents: amounts.itemsSumCents,
  }
}

async function seedFourTypes(database: TestDatabase) {
  const worldA = await seedWorld(database)
  const worldB = await seedWorld(database)
  const strictSameName = await seedSubject(database, {
    isStrict: true,
    name: NAME_PARTIAL_RETURN,
    world: worldA,
  })
  const looseSameName = await seedSubject(database, {
    isStrict: false,
    name: NAME_PARTIAL_RETURN,
    world: worldB,
  })
  const strictOtherName = await seedSubject(database, {
    isStrict: true,
    name: NAME_EXTENSION,
    world: worldA,
  })
  const looseOtherName = await seedSubject(database, {
    isStrict: false,
    name: NAME_TOTAL_RETURN,
    world: worldB,
  })
  return { looseOtherName, looseSameName, strictOtherName, strictSameName }
}

describe('só a configuração decide, contra o banco (spec 247 T4.5, CA03)', () => {
  testWithPostgres(
    'mesma configuração, nomes diferentes: mesma cobrança em cada etapa; configuração diferente com o mesmo nome muda',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { looseOtherName, looseSameName, strictOtherName, strictSameName } =
          await seedFourTypes(database)
        const steps = [{}, { referenceNumber: REFERENCE_NUMBER }] as const

        const strictSame = await Promise.all(
          steps.map((step) => outcomeOf(database, strictSameName, step)),
        )
        const strictOther = await Promise.all(
          steps.map((step) => outcomeOf(database, strictOtherName, step)),
        )

        expect(strictSame).toEqual([
          { code: REFERENCE_NUMBER_REQUIRED, field: 'referenceNumber' },
          { code: DECLARED_AMOUNT_REQUIRED, field: 'items[0].declaredAmount' },
        ])
        expect(strictOther).toEqual(strictSame)
        expect(await outcomeOf(database, looseSameName, {})).toEqual(SAVED_OUTCOME)
        expect(await outcomeOf(database, looseOtherName, {})).toEqual(SAVED_OUTCOME)
      })
    },
    90_000,
  )

  testWithPostgres(
    'o gravado, a soma e o e-mail de nomes diferentes com a mesma configuração são idênticos',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { looseSameName, strictOtherName, strictSameName } = await seedFourTypes(database)
        const input = { referenceNumber: REFERENCE_NUMBER, withAmounts: true } as const

        const first = await readStored(
          database,
          (await registerFor(database, strictSameName, input)).id,
        )
        const second = await readStored(
          database,
          (await registerFor(database, strictOtherName, input)).id,
        )
        const loose = await readStored(
          database,
          (await registerFor(database, looseSameName, {})).id,
        )

        expect(second).toEqual(first)
        expect(first.lines).toEqual([
          {
            declaredAmount: '25.0000',
            productCode: 'P1',
            quantity: '2.000',
            quantityUnit: 'CX',
            unitValue: '19.9950',
          },
          {
            declaredAmount: '57.2000',
            productCode: 'P2',
            quantity: '1.000',
            quantityUnit: 'UN',
            unitValue: '57.2000',
          },
        ])
        const firstSummary = summarize(first, true)
        expect(summarize(second, true)).toEqual(firstSummary)
        expect(firstSummary.declaredAmountCents).toBe(8220n)
        expect(firstSummary.itemsSumCents).toBe(9719n)
        expect(firstSummary.email).toBe(
          'NFD NFD 45029\nP1 2 CX = 25,00\nP2 1 UN = 57,20\nPago 82,20 de 97,19',
        )
        expect(loose.occurrence.referenceNumber).toBeNull()
        expect(summarize(loose, false).email).toBe('Aviso: cliente ausente')
      })
    },
    90_000,
  )

  testWithPostgres(
    'a exceção do contratante da nota (lida do banco) vale; o modo do tipo não',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { strictSameName } = await seedFourTypes(database)
        expect(await outcomeOf(database, strictSameName, {})).toEqual({
          code: REFERENCE_NUMBER_REQUIRED,
          field: 'referenceNumber',
        })

        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'off',
          companyId: strictSameName.world.company.companyId,
          contractorId: strictSameName.world.contractorId,
          declaredAmountMode: 'optional',
          occurrenceTypeId: strictSameName.id,
          referenceNumberMode: 'off',
        })

        expect(await outcomeOf(database, strictSameName, {})).toEqual(SAVED_OUTCOME)
      })
    },
    90_000,
  )
})
