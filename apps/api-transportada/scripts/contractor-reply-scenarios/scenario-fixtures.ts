/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: the building blocks of the scenario seeder, copied from the integration fixtures
 * (`trip-field-office-database.fixture.ts`, `occurrence-conversation-database.fixture.ts`) without
 * `bun:test`, and pointed at an existing company instead of a disposable one. Everything created here
 * carries a marker (name prefix, bucket, import key) so `--reset` can find it again.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypeMoments,
  companyOccurrenceTypes,
  contractorContacts,
  contractorMailSettings,
  contractorMailTemplates,
  contractors,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  tripDocuments,
  tripDrivers,
  tripStops,
  trips,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import {
  SCENARIO_BUCKET,
  SCENARIO_CONTRACTOR_TAX_ID,
  SCENARIO_IMPORT_KEY_PREFIX,
  SCENARIO_MAIL_DOMAIN,
  SCENARIO_PLATE_PREFIX,
  SCENARIO_PREFIX,
} from './scenario.constant.js'

export type ScenarioDatabase = ReturnType<typeof createDrizzleProvider>

export type ScenarioContext = {
  readonly actorUserId: string
  readonly companyId: string
  readonly contractorId: string
  readonly database: ScenarioDatabase
}

export type SeededNote = {
  readonly documentId: string
  readonly driverId: string
  readonly tripId: string
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

export function scenarioTypeName(suffix: string): string {
  return `${SCENARIO_PREFIX} Prorrogação — ${suffix}`
}

/** The company's mail settings must be verified for the automatic mail to open the reply. */
export async function ensureMailSettings(
  database: ScenarioDatabase,
  companyId: string,
): Promise<void> {
  const [existing] = await database.db
    .select({ sendingVerifiedAt: contractorMailSettings.sendingVerifiedAt })
    .from(contractorMailSettings)
    .where(eq(contractorMailSettings.companyId, companyId))
  if (existing !== undefined) {
    if (existing.sendingVerifiedAt === null) {
      throw new Error(
        'CONTRACTOR_MAIL_SETTINGS_NOT_VERIFIED: a empresa já tem configuração de e-mail sem verificação; verifique-a no painel ou use outra empresa',
      )
    }
    return
  }
  await database.db.insert(contractorMailSettings).values({
    companyId,
    replyDomain: `resposta.${SCENARIO_MAIL_DOMAIN}`,
    secretEnvelope: {},
    senderAddress: `ocorrencias@${SCENARIO_MAIL_DOMAIN}`,
    senderName: `${SCENARIO_PREFIX} Transportadora`,
    sendingVerifiedAt: new Date(),
  })
}

/** The contractor that issues the notes, with the two contacts that receive occurrences. */
export async function ensureContractor(
  database: ScenarioDatabase,
  companyId: string,
): Promise<string> {
  const displayName = `${SCENARIO_PREFIX} Contratante Alfa`
  const [existing] = await database.db
    .select({ displayName: contractors.displayName, id: contractors.id })
    .from(contractors)
    .where(
      and(eq(contractors.companyId, companyId), eq(contractors.taxId, SCENARIO_CONTRACTOR_TAX_ID)),
    )
  if (existing !== undefined) {
    if (existing.displayName !== displayName) {
      throw new Error('CONTRACTOR_TAX_ID_TAKEN: o CNPJ de teste já é de outra contratante')
    }
    return existing.id
  }
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId, displayName, id: contractorId, taxId: SCENARIO_CONTRACTOR_TAX_ID })
  await database.db.insert(contractorContacts).values([
    { companyId, contractorId, email: `compras@${SCENARIO_MAIL_DOMAIN}` },
    { companyId, contractorId, email: `fiscal@${SCENARIO_MAIL_DOMAIN}` },
  ])
  return contractorId
}

async function createNfeDocument(
  context: ScenarioContext,
  input: { readonly recipientEmail?: string },
): Promise<string> {
  const { companyId, database } = context
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const suffix = documentId.replaceAll('-', '')
  const sha = suffix.padEnd(64, '0').slice(0, 64)
  const digits = suffix.replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) % 10))

  await database.db.insert(storedObjects).values({
    bucket: SCENARIO_BUCKET,
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `${SCENARIO_BUCKET}/nfe/${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `${SCENARIO_IMPORT_KEY_PREFIX}${suffix}`,
    id: importId,
    idempotencyKey: `${SCENARIO_IMPORT_KEY_PREFIX}${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: context.actorUserId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${digits}${'0'.repeat(12)}`,
    authorizationProtocol: `protocol-${suffix}`,
    companyId,
    createdByUserId: context.actorUserId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date(),
    model: '55',
    number: `1${digits.slice(0, 5)}`,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    recipientEmail: input.recipientEmail ?? null,
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '10000.0000',
    xmlObjectId,
    xmlSha256: sha,
  })
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId,
    id: crypto.randomUUID(),
    legalName: `${SCENARIO_PREFIX} Contratante Alfa Indústria Ltda`,
    role: 'emitter',
    taxId: SCENARIO_CONTRACTOR_TAX_ID,
    tradeName: `${SCENARIO_PREFIX} Contratante Alfa`,
  })
  return documentId
}

async function createDriver(
  context: ScenarioContext,
  input: { readonly hasAccount: boolean; readonly sequence: number },
): Promise<{ readonly id: string; readonly name: string; readonly taxId: string }> {
  const { companyId, database } = context
  const id = crypto.randomUUID()
  const name = `${SCENARIO_PREFIX} Motorista ${input.sequence}`
  const taxId = `9990248${String(input.sequence).padStart(4, '0')}`
  await database.db.insert(fleetDrivers).values({ companyId, id, name, taxId })
  if (input.hasAccount) {
    const userId = crypto.randomUUID()
    const membershipId = crypto.randomUUID()
    await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
    await database.db
      .insert(userCompanyMemberships)
      .values({ companyId, id: membershipId, status: 'active', userId })
    await database.db.update(fleetDrivers).set({ membershipId }).where(eq(fleetDrivers.id, id))
  }
  return { id, name, taxId }
}

/** One in-transit trip with one stop, one loaded note and its driver. */
export async function seedNote(
  context: ScenarioContext,
  input: {
    readonly hasDriverAccount: boolean
    readonly recipientEmail?: string
    readonly sequence: number
  },
): Promise<SeededNote> {
  const { companyId, database } = context
  const vehicleId = crypto.randomUUID()
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    model: SCENARIO_PREFIX,
    plate: `${SCENARIO_PLATE_PREFIX}${input.sequence}A48`,
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  const driver = await createDriver(context, {
    hasAccount: input.hasDriverAccount,
    sequence: input.sequence,
  })
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'in_transit', vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId: driver.id,
    driverName: driver.name,
    driverTaxId: driver.taxId,
    position: 1n,
    tripId,
  })
  await database.db.insert(tripStops).values({
    addressKey: `3550308|01001000|${tripId}`,
    arrivedAt: null,
    companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })
  const nfeDocumentId = await createNfeDocument(
    context,
    input.recipientEmail === undefined ? {} : { recipientEmail: input.recipientEmail },
  )
  await database.db.insert(tripDocuments).values({
    companyId,
    id: documentId,
    loadedAt: new Date(),
    nfeDocumentId,
    separatedAt: new Date(),
    separationStatus: 'loaded',
    stopId,
    tripId,
  })
  return { documentId, driverId: driver.id, tripId }
}

export type OccurrenceTypeInput = {
  readonly alertMode: 'alert_operator' | 'off'
  readonly forwardToNoteRecipient: 'manual' | 'off'
  readonly mode: 'forward_after_approval' | 'forward_automatic'
  readonly name: string
}

export async function createOccurrenceType(
  context: ScenarioContext,
  input: OccurrenceTypeInput,
  settings: { readonly alertIntervalMinutes: number; readonly alertMaxCount: number },
): Promise<string> {
  const { companyId, database } = context
  const id = crypto.randomUUID()
  const forwards = input.forwardToNoteRecipient !== 'off'
  const mailTemplateId = crypto.randomUUID()
  await database.db.insert(contractorMailTemplates).values({
    actorUserId: context.actorUserId,
    closing: 'Aguardamos o retorno.',
    companyId,
    id: mailTemplateId,
    intro: 'Solicitamos a prorrogação do boleto da nota {numero_nota}: {observacao}',
    itemText: '{codigo_item} - {item}',
    mailType: 'occurrence',
    name: `${SCENARIO_PREFIX} Modelo — ${input.name}`,
    status: 'active',
    subject: 'Prorrogação de boleto — NF {numero_nota}',
  })
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId,
    contractorReplyAlertIntervalMinutes: settings.alertIntervalMinutes,
    contractorReplyAlertMaxCount: settings.alertMaxCount,
    contractorReplyAlertMode: input.alertMode,
    contractorReplyMode: input.mode,
    contractorMailTemplateId: mailTemplateId,
    contractorReplyWaitHours: 6,
    driverReplyTemplate: 'Segue o boleto prorrogado.',
    emailsContractor: true,
    forwardEmailBody: forwards ? 'Segue o boleto prorrogado da nota {{numeroNota}}.' : '',
    forwardEmailSubject: forwards ? 'Boleto prorrogado — NF {{numeroNota}}' : '',
    forwardToNoteRecipient: input.forwardToNoteRecipient,
    id,
    name: input.name,
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'separation',
  })
  await database.db
    .insert(companyOccurrenceTypeMoments)
    .values({ companyId, moment: 'separation', occurrenceTypeId: id })
  return id
}

/** Registers the note occurrence through the production path (with a photo, as the shop floor does). */
export async function registerOccurrence(
  context: ScenarioContext,
  input: { readonly note: SeededNote; readonly typeId: string; readonly typeName: string },
): Promise<string> {
  const { companyId, database } = context
  const occurrence = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: context.actorUserId,
      companyId,
      documentId: input.note.documentId,
      items: [],
      note: 'Cliente pediu mais prazo para o boleto',
      occurrenceTypeId: input.typeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'blocked',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: input.note.tripId,
      typeName: input.typeName,
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date(),
    storage: {
      async remove() {},
      async store() {
        return { sha256: crypto.randomUUID().replaceAll('-', '').repeat(2) }
      },
    },
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, SCENARIO_BUCKET),
  })
  if (occurrence === null) throw new Error('EXPECTED_OCCURRENCE')
  return occurrence.id
}
