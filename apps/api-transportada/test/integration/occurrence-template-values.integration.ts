/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.7 (CA01, CA03, RF6-RF9), contra Postgres real: a ocorrência registrada pelo motorista com
 * itens, número e valor pago vira o aviso automático à contratante com os valores REAIS gravados — pelo
 * caminho de produção (`registerDriverOccurrence` → `createAutomaticOccurrenceMailReader` → envio da 143).
 * O modelo do SAC sai com o assunto e o corpo exatos; `SPANI` vem de `contractors.display_name`. A CA03
 * da T4.5 é estendida a esse caminho: o e-mail segue a configuração, nunca o nome do tipo.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  contractorContacts,
  contractorMailMessages,
  contractorMailSettings,
  contractors,
  nfeDocuments,
  nfeParticipants,
  nfeProducts,
  tripDocuments,
} from '../../src/database/database.schema.js'
import { createSendAutomaticOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-automatic-occurrence-mail.use-case.js'
import {
  createAutomaticOccurrenceMailReader,
  createOccurrenceSuggestedMailReader,
} from '../../src/occurrence-conversation/infrastructure/drizzle-occurrence-mail.repository.js'
import {
  createOccurrenceMailUseCase,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import { registerStreetOccurrence } from '../fixtures/street-occurrence-registration.fixture.js'
import type { StreetOccurrenceRegistration } from '../fixtures/street-occurrence-registration.fixture.js'
import { seedCompany, seedTrip } from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '30290856000160'
const RECIPIENT_TAX_ID = '12345678000190'
const NOTE = 'Avaria identificada no momento da conferência das mercadorias'
const SAC_CODE = '2073170 02'
const SAC_DESCRIPTION = 'MAC ADRIA OVOS 500G – PARAFUSO'
const SAC_NUMBER = '680481'
const SAC_RECIPIENT = 'MERCADO DA LOJA LTDA'
const REFERENCE_NUMBER = '45029'
const SAC_SUBJECT = 'OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL'
const SAC_BODY = [
  'Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.',
  '',
  'NFD {{numeroReferencia}} – R$ {{valorDeclarado}}',
  'RAZÃO SOCIAL: {{razaoSocial}}',
  'NOTA FISCAL: {{numeroNotaSemSerie}}',
  'VALOR DA ENTREGA: R$ {{valorNota}}',
  '',
  '{{linhasItens}}',
].join('\n')
const SAC_LINE = '{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}} – {{observacao}}'
const SAC_EXPECTED_SUBJECT = `OCORRÊNCIA: SPANI – NF ${SAC_NUMBER} – DEVOLUÇÃO PARCIAL`
const sacExpectedBody = (declaredAmount: string) =>
  [
    'Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.',
    '',
    `NFD ${REFERENCE_NUMBER} – R$ ${declaredAmount}`,
    `RAZÃO SOCIAL: ${SAC_RECIPIENT}`,
    `NOTA FISCAL: ${SAC_NUMBER}`,
    'VALOR DA ENTREGA: R$ 7.840,64',
    '',
    `${SAC_CODE} – ${SAC_DESCRIPTION} – 1FD – ${NOTE}`,
  ].join('\n')

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type World = { readonly company: Company; readonly trip: SeededTrip }

type TypeConfiguration = {
  readonly declaredAmountMode: 'off' | 'optional' | 'required'
  readonly declaredAmountScope: 'item' | 'occurrence'
  readonly emailBody: string
  readonly emailItemLineTemplate: string
  readonly emailSubject: string
  readonly itemsMode: 'off' | 'optional' | 'required'
  readonly name: string
}

const SAC_CONFIGURATION: Omit<TypeConfiguration, 'name'> = {
  declaredAmountMode: 'optional',
  declaredAmountScope: 'item',
  emailBody: SAC_BODY,
  emailItemLineTemplate: SAC_LINE,
  emailSubject: SAC_SUBJECT,
  itemsMode: 'required',
}

async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  const documentId = row.nfeDocumentId
  await database.db
    .update(nfeDocuments)
    .set({ number: SAC_NUMBER, series: '1', totalValue: '7840.6400' })
    .where(eq(nfeDocuments.id, documentId))

  const contractorId = crypto.randomUUID()
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'SPANI',
    id: contractorId,
    taxId: EMITTER_TAX_ID,
  })
  await database.db.insert(nfeParticipants).values([
    {
      companyId: company.companyId,
      documentId,
      legalName: 'Spani Atacadista Ltda',
      role: 'emitter',
      taxId: EMITTER_TAX_ID,
    },
    {
      companyId: company.companyId,
      documentId,
      legalName: SAC_RECIPIENT,
      role: 'recipient',
      taxId: RECIPIENT_TAX_ID,
    },
  ])
  const base = { cfop: '5102', companyId: company.companyId, documentId, ncm: '19053100' }
  await database.db.insert(nfeProducts).values([
    {
      ...base,
      code: SAC_CODE,
      commercialUnit: 'FD',
      description: SAC_DESCRIPTION,
      ordinal: 1n,
      quantity: '10.0000',
      totalValue: '572.0000',
      unitValue: '57.2000',
    },
    {
      ...base,
      code: 'P2',
      commercialUnit: 'UN',
      description: 'Bolo',
      ordinal: 2n,
      quantity: '4.0000',
      totalValue: '40.0000',
      unitValue: '10.0000',
    },
  ])
  await database.db.insert(contractorContacts).values({
    companyId: company.companyId,
    contractorId,
    email: 'sac@spani.example.test',
  })
  await database.db.insert(contractorMailSettings).values({
    companyId: company.companyId,
    replyDomain: 'resposta.example.test',
    secretEnvelope: {},
    senderAddress: 'ocorrencias@transportadora.example.test',
    senderName: 'Transportadora Sintética',
    sendingVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  })
  return { company, trip }
}

async function seedType(
  database: TestDatabase,
  world: World,
  configuration: TypeConfiguration,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    allowsMultipleItems: true,
    companyId: world.company.companyId,
    declaredAmountMode: configuration.declaredAmountMode,
    declaredAmountScope: configuration.declaredAmountScope,
    emailBody: configuration.emailBody,
    emailItemLineTemplate: configuration.emailItemLineTemplate,
    emailSubject: configuration.emailSubject,
    emailsContractor: true,
    id,
    itemsMinimumCount: configuration.itemsMode === 'required' ? 1 : null,
    itemsMode: configuration.itemsMode,
    name: configuration.name,
    referenceNumberMode: 'required',
    stage: 'delivery',
  })
  return id
}

async function register(
  database: TestDatabase,
  world: World,
  input: Pick<
    StreetOccurrenceRegistration,
    'declaredAmount' | 'items' | 'referenceNumber' | 'typeId'
  >,
): Promise<string> {
  const saved = await registerStreetOccurrence(database, {
    attachmentObjectId: null,
    company: world.company,
    note: NOTE,
    trip: world.trip,
    ...input,
  })
  return saved.id
}

function automaticMail(database: TestDatabase) {
  return createSendAutomaticOccurrenceMailUseCase({
    reader: createAutomaticOccurrenceMailReader(database.db),
    sendMail: createOccurrenceMailUseCase(database),
  })
}

async function suggestedMail(database: TestDatabase, world: World, occurrenceId: string) {
  return createOccurrenceSuggestedMailReader(database.db).readSuggestedMail({
    companyId: world.company.companyId,
    occurrenceId,
  })
}

describe('o aviso automático com os valores gravados pelo motorista (spec 247 T4.7, CA01)', () => {
  testWithPostgres(
    'o modelo do SAC sai com o assunto e o corpo exatos; SPANI vem da contratante da nota',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, world, { ...SAC_CONFIGURATION, name: 'Tipo SAC' })
        const occurrenceId = await register(database, world, {
          items: [{ productCode: SAC_CODE, quantity: '1' }],
          referenceNumber: REFERENCE_NUMBER,
          typeId,
        })

        const result = await automaticMail(database).send({
          companyId: world.company.companyId,
          correlationId: 'correlation-t47-1',
          occurrenceId,
        })
        expect(result).toMatchObject({ outcome: 'sent' })

        const [mail] = await database.db
          .select({
            bodyText: contractorMailMessages.bodyText,
            subject: contractorMailMessages.subject,
          })
          .from(contractorMailMessages)
          .where(eq(contractorMailMessages.companyId, world.company.companyId))
        expect(mail?.subject).toBe(SAC_EXPECTED_SUBJECT)
        expect(mail?.bodyText).toBe(sacExpectedBody('57,20'))

        const suggested = await suggestedMail(database, world, occurrenceId)
        expect(suggested).toEqual({ bodyText: mail?.bodyText ?? '', subject: mail?.subject ?? '' })
      })
    },
    60_000,
  )

  testWithPostgres(
    'o valor pago digitado vence na linha, a soma da linha continua a calculada, e a quantidade é a da ocorrência',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, world, {
          ...SAC_CONFIGURATION,
          emailBody:
            'Pago {{valorDeclarado}} de {{somaItens}} – {{quantidadeItem}} – R$ {{valorNota}}',
          name: 'Tipo quantidade',
        })
        const occurrenceId = await register(database, world, {
          items: [{ declaredAmount: '50', productCode: SAC_CODE, quantity: '2.5' }],
          referenceNumber: REFERENCE_NUMBER,
          typeId,
        })

        const suggested = await suggestedMail(database, world, occurrenceId)

        expect(suggested?.bodyText).toBe('Pago 50,00 de 143,00 – 2,5 – R$ 7.840,64')
      })
    },
    60_000,
  )

  testWithPostgres(
    'o valor pago da ocorrência (escopo occurrence) entra em valorDeclarado; sem itens, linhasItens sai vazio',
    async () => {
      await withConversationDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, world, {
          ...SAC_CONFIGURATION,
          declaredAmountScope: 'occurrence',
          emailBody: 'NFD {{numeroReferencia}} – R$ {{valorDeclarado}}\n[{{linhasItens}}]',
          itemsMode: 'off',
          name: 'Tipo da nota inteira',
        })
        const occurrenceId = await register(database, world, {
          declaredAmount: '99.9',
          referenceNumber: REFERENCE_NUMBER,
          typeId,
        })

        const suggested = await suggestedMail(database, world, occurrenceId)

        expect(suggested?.bodyText).toBe(`NFD ${REFERENCE_NUMBER} – R$ 99,90\n[]`)
      })
    },
    60_000,
  )
})

describe('só a configuração decide o e-mail pelo caminho real de envio (spec 247 T4.7, CA03)', () => {
  testWithPostgres(
    'mesmo nome e configuração diferente dão e-mails diferentes; nomes diferentes e a mesma configuração dão o mesmo',
    async () => {
      await withConversationDatabase(async (database) => {
        const strict = await seedWorld(database)
        const loose = await seedWorld(database)
        const sameName = 'Devolução parcial'
        const strictTypeId = await seedType(database, strict, {
          ...SAC_CONFIGURATION,
          name: sameName,
        })
        const looseTypeId = await seedType(database, loose, {
          declaredAmountMode: 'off',
          declaredAmountScope: 'occurrence',
          emailBody: 'Aviso: {{observacao}}',
          emailItemLineTemplate: '',
          emailSubject: 'Aviso {{numeroNota}}',
          itemsMode: 'optional',
          name: sameName,
        })
        const firstTwin = await seedType(database, strict, { ...SAC_CONFIGURATION, name: 'Alfa' })
        const secondTwin = await seedType(database, strict, { ...SAC_CONFIGURATION, name: 'Beta' })

        const strictInput = {
          items: [{ productCode: SAC_CODE, quantity: '1' }],
          referenceNumber: REFERENCE_NUMBER,
        }
        const [strictId, firstId, secondId] = [
          await register(database, strict, { ...strictInput, typeId: strictTypeId }),
          await register(database, strict, { ...strictInput, typeId: firstTwin }),
          await register(database, strict, { ...strictInput, typeId: secondTwin }),
        ]
        const looseId = await register(database, loose, {
          referenceNumber: REFERENCE_NUMBER,
          typeId: looseTypeId,
        })

        const planOf = async (world: World, occurrenceId: string) =>
          (
            await createAutomaticOccurrenceMailReader(database.db).findPlan({
              companyId: world.company.companyId,
              occurrenceId,
            })
          )?.suggested

        const strictMail = await planOf(strict, strictId)
        const looseMail = await planOf(loose, looseId)
        expect(strictMail?.subject).toBe(SAC_EXPECTED_SUBJECT)
        expect(looseMail?.subject).toBe(`Aviso ${SAC_NUMBER}/1`)
        expect(looseMail?.bodyText).toBe(`Aviso: ${NOTE}`)
        expect(strictMail).not.toEqual(looseMail)

        expect(await planOf(strict, firstId)).toEqual(strictMail)
        expect(await planOf(strict, secondId)).toEqual(strictMail)
      })
    },
    90_000,
  )
})
