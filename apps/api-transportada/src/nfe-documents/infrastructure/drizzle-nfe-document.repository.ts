/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { type SQL, and, desc, eq, inArray, isNull, lt, ne, or, sum } from 'drizzle-orm'

import { companyCargoSettings } from '../../database/company-cargo-settings.schema.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { buildStopAddressKey } from '../../trips/domain/stop-address-key.js'
import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import { nfseServiceInvoiceDocuments, nfseServiceInvoices } from '../../database/nfse.schema.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import { resolveDocumentBlock } from '../../cte-batches/domain/cte-batch-eligibility.policy.js'
import { resolveCargoWeight } from '../domain/cargo-weight.policy.js'
import { resolveNfseDocumentBlock } from '../domain/nfse-document-block.policy.js'
import { findTripLinks } from '../../cte-batches/infrastructure/cte-batch-selection.query.js'
import type { TripDocumentLink } from '../../cte-batches/application/cte-batch-preview.port.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import { ApiError } from '../../shared/api.error.js'
import type {
  DownloadNfeDocumentXmlResult,
  NfeDocumentDetail,
  NfeDocumentEligibility,
  NfeDocumentPage,
  NfeDocumentRepositoryPort,
  NfeDocumentSummary,
} from '../application/nfe-document.types.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type DocumentRecord = typeof nfeDocuments.$inferSelect
type StoredObjectRecord = typeof storedObjects.$inferSelect

type ParticipantDetail = {
  readonly address: string | null
  /**
   * O número **cru**, ao lado do endereço já composto. Ele entra na chave da parada
   * (`buildStopAddressKey`), e extraí-lo de volta do texto composto seria uma segunda regra de
   * normalização — a que diverge em silêncio.
   */
  readonly addressNumber: string | null
  /**
   * Onde o endereço fica, quando a cascata de geocodificação já o resolveu (ADR-0044 §3).
   *
   * ⚠️ A **precisão viaja junto, e é obrigatória na tela**: `city` é centroide de município, palpite
   * de quilômetros, e a ADR-0044 §5 exige que ela apareça marcada em vez de passar por endereço.
   * Servir a coordenada sem a precisão é o modo de falha da §1 — número plausível, sem aviso.
   */
  readonly latitude: string | null
  readonly longitude: string | null
  readonly locationPrecision: string | null
  /** O CEP cru, sem máscara: quem imprime decide o traço, e o banco guarda oito dígitos. */
  readonly postalCode: string | null
  readonly city: string | null
  readonly cityCode: string | null
  readonly name: string
  readonly state: string | null
  readonly taxId: string | null
}

type DocumentParticipants = {
  readonly emitter: ParticipantDetail
  readonly recipient: ParticipantDetail
}

const EMPTY_PARTICIPANT: ParticipantDetail = {
  address: null,
  addressNumber: null,
  latitude: null,
  longitude: null,
  locationPrecision: null,
  postalCode: null,
  city: null,
  cityCode: null,
  name: '',
  state: null,
  taxId: null,
}

const CANCELLED_BATCH_STATUS = 'cancelled'

type DocumentScope = {
  readonly companyId: string
  readonly documentIds: readonly string[]
}

/**
 * O número vem `null` enquanto a prefeitura não autoriza: a nota existe e já segura o documento,
 * mas ainda não tem numeração. Quem consome mostra o vínculo mesmo assim.
 */
type NfseInvoiceLink = {
  readonly id: string
  readonly number: string | null
}

type DocumentVolumeTotals = {
  readonly grossWeight: string | null
  readonly quantity: string | null
}

type DocumentBlockContext = {
  readonly batchIdByDocumentId: ReadonlyMap<string, string>
  /** Nulo é estimativa desligada nesta empresa; resolvido uma vez por página, nunca por linha. */
  readonly defaultVolumeWeight: string | null
  readonly volumeTotalsByDocumentId: ReadonlyMap<string, DocumentVolumeTotals>
  readonly nfseInvoiceByDocumentId: ReadonlyMap<string, NfseInvoiceLink>
  /** Spec 065 D4b: sinal de "esta nota já saiu numa viagem". Nenhum bloqueio o lê. */
  readonly tripByDocumentId: ReadonlyMap<string, TripDocumentLink>
}

const EMPTY_BLOCK_CONTEXT: DocumentBlockContext = {
  batchIdByDocumentId: new Map(),
  defaultVolumeWeight: null,
  volumeTotalsByDocumentId: new Map(),
  nfseInvoiceByDocumentId: new Map(),
  tripByDocumentId: new Map(),
}

export function buildDocumentGrossWeightFilters({
  companyId,
  documentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(nfeVolumes.companyId, companyId),
    inArray(nfeVolumes.documentId, [...documentIds]),
  ] as const as readonly SQL[]
}

export function buildDocumentBatchLinkFilters({
  companyId,
  documentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(cteBatchItemDocuments.companyId, companyId),
    inArray(cteBatchItemDocuments.nfeDocumentId, [...documentIds]),
    ne(cteBatches.status, CANCELLED_BATCH_STATUS),
  ] as const as readonly SQL[]
}

/**
 * O vínculo com a nota de serviço é liberado marcando `cancelled_at` na mesma transação que cancela
 * a nota, então esse é o recorte de vínculo ativo — o mesmo que o índice parcial único guarda.
 */
export function buildDocumentNfseLinkFilters({
  companyId,
  documentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(nfseServiceInvoiceDocuments.companyId, companyId),
    inArray(nfseServiceInvoiceDocuments.nfeDocumentId, [...documentIds]),
    isNull(nfseServiceInvoiceDocuments.cancelledAt),
  ] as const as readonly SQL[]
}

/**
 * O filtro de tenant é o primeiro da lista e não é opcional: a chave de acesso é única por empresa
 * (`nfe_documents_company_id_access_key_unique`), então a chave da nota alheia sai como página
 * vazia — indistinguível de chave inexistente, que é o que impede varrer a base oito dígitos por vez.
 */
export function buildDocumentListFilters({
  accessKey,
  companyId,
  cursor,
}: {
  readonly accessKey: string | null
  readonly companyId: string
  readonly cursor: { readonly createdAt: Date; readonly id: string } | null
}): readonly SQL[] {
  const filters: SQL[] = [eq(nfeDocuments.companyId, companyId)]
  if (accessKey !== null) filters.push(eq(nfeDocuments.accessKey, accessKey))
  if (cursor !== null) {
    filters.push(
      or(
        lt(nfeDocuments.issuedAt, cursor.createdAt),
        and(eq(nfeDocuments.issuedAt, cursor.createdAt), lt(nfeDocuments.id, cursor.id)),
      )!,
    )
  }
  return filters
}

export class DrizzleNfeDocumentRepository implements NfeDocumentRepositoryPort {
  public constructor(
    private readonly database: Database,
    private readonly storage: NfeStorageGateway,
  ) {}

  public async list(input: {
    readonly accessKey: string | null
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeDocumentPage> {
    const filters = buildDocumentListFilters({
      accessKey: input.accessKey,
      companyId: input.context.companyId,
      cursor: decodeCursor(input.cursor),
    })
    const rows = await this.database
      .select()
      .from(nfeDocuments)
      .where(and(...filters))
      .orderBy(desc(nfeDocuments.issuedAt), desc(nfeDocuments.id))
      .limit(input.limit + 1)
    const pageRows = rows.slice(0, input.limit)
    const last = pageRows.at(-1)
    const scope: DocumentScope = {
      companyId: input.context.companyId,
      documentIds: pageRows.map((record) => record.id),
    }
    const [participantsByDocument, blockContext] = await Promise.all([
      this.loadParticipants(scope.companyId, scope.documentIds),
      this.loadBlockContext(scope),
    ])
    return {
      items: pageRows.map((record) =>
        mapSummary(record, participantsByDocument.get(record.id), blockContext),
      ),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? `${last.issuedAt.toISOString()}::${last.id}`
          : null,
    }
  }

  public async get(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentDetail> {
    const document = await this.findDocument(input.context.companyId, input.documentId)
    if (document === null) throw notFound()
    const scope: DocumentScope = {
      companyId: input.context.companyId,
      documentIds: [document.id],
    }
    const [participantsByDocument, blockContext] = await Promise.all([
      this.loadParticipants(scope.companyId, scope.documentIds),
      this.loadBlockContext(scope),
    ])
    return mapSummary(document, participantsByDocument.get(document.id), blockContext)
  }

  public async getEligibility(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentEligibility> {
    const document = await this.findDocument(input.context.companyId, input.documentId)
    if (document === null) throw notFound()
    return {
      authorizedDocument: document.status === 'authorized',
      companyRelated: true,
      decision: 'PENDING_FREIGHT_AND_CTE_RULES',
      hasOriginalXml: true,
    }
  }

  public async downloadXml(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<DownloadNfeDocumentXmlResult> {
    const row = await this.findDocumentWithObject(input.context.companyId, input.documentId)
    if (row === null) throw notFound()
    return {
      accessKey: row.document.accessKey,
      content: await this.storage.getObjectStream({
        bucket: row.object.bucket,
        key: row.object.objectKey,
      }),
      contentType: row.object.mimeType,
      fileName: `${row.document.accessKey}.xml`,
    }
  }

  private async findDocument(
    companyId: string,
    documentId: string,
  ): Promise<DocumentRecord | null> {
    const [record] = await this.database
      .select()
      .from(nfeDocuments)
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.id, documentId)))
      .limit(1)
    return record ?? null
  }

  private async findDocumentWithObject(
    companyId: string,
    documentId: string,
  ): Promise<{
    readonly document: DocumentRecord
    readonly object: StoredObjectRecord
  } | null> {
    const [row] = await this.database
      .select({ document: nfeDocuments, object: storedObjects })
      .from(nfeDocuments)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.companyId, nfeDocuments.companyId),
          eq(storedObjects.id, nfeDocuments.xmlObjectId),
        ),
      )
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.id, documentId)))
      .limit(1)
    return row ?? null
  }

  private async loadBlockContext(scope: DocumentScope): Promise<DocumentBlockContext> {
    if (scope.documentIds.length === 0) return EMPTY_BLOCK_CONTEXT
    const [volumeRows, defaultWeightRows, linkRows, nfseLinkRows, tripLinkRows] = await Promise.all(
      [
        this.database
          .select({
            documentId: nfeVolumes.documentId,
            grossWeight: sum(nfeVolumes.grossWeight),
            quantity: sum(nfeVolumes.quantity),
          })
          .from(nfeVolumes)
          .where(and(...buildDocumentGrossWeightFilters(scope)))
          .groupBy(nfeVolumes.documentId),
        this.database
          .select({ defaultVolumeWeight: companyCargoSettings.defaultVolumeWeight })
          .from(companyCargoSettings)
          .where(eq(companyCargoSettings.companyId, scope.companyId))
          .limit(1),
        this.database
          .selectDistinctOn([cteBatchItemDocuments.nfeDocumentId], {
            batchId: cteBatchItemDocuments.batchId,
            documentId: cteBatchItemDocuments.nfeDocumentId,
          })
          .from(cteBatchItemDocuments)
          .innerJoin(
            cteBatches,
            and(
              eq(cteBatches.companyId, cteBatchItemDocuments.companyId),
              eq(cteBatches.id, cteBatchItemDocuments.batchId),
            ),
          )
          .where(and(...buildDocumentBatchLinkFilters(scope)))
          .orderBy(cteBatchItemDocuments.nfeDocumentId),
        this.database
          .selectDistinctOn([nfseServiceInvoiceDocuments.nfeDocumentId], {
            documentId: nfseServiceInvoiceDocuments.nfeDocumentId,
            invoiceId: nfseServiceInvoiceDocuments.invoiceId,
            providerNumber: nfseServiceInvoices.providerNumber,
          })
          .from(nfseServiceInvoiceDocuments)
          .innerJoin(
            nfseServiceInvoices,
            and(
              eq(nfseServiceInvoices.companyId, nfseServiceInvoiceDocuments.companyId),
              eq(nfseServiceInvoices.id, nfseServiceInvoiceDocuments.invoiceId),
            ),
          )
          .where(and(...buildDocumentNfseLinkFilters(scope)))
          .orderBy(nfseServiceInvoiceDocuments.nfeDocumentId),
        // A mesma consulta que a composição do lote usa: um sinal só, num lugar só (spec 065 D4b).
        findTripLinks(this.database, scope),
      ],
    )

    return {
      batchIdByDocumentId: new Map(linkRows.map((row) => [row.documentId, row.batchId])),
      defaultVolumeWeight: defaultWeightRows[0]?.defaultVolumeWeight ?? null,
      volumeTotalsByDocumentId: new Map(
        volumeRows.map((row) => [
          row.documentId,
          { grossWeight: row.grossWeight, quantity: row.quantity },
        ]),
      ),
      nfseInvoiceByDocumentId: new Map(
        nfseLinkRows.map((row) => [
          row.documentId,
          { id: row.invoiceId, number: row.providerNumber },
        ]),
      ),
      tripByDocumentId: new Map(tripLinkRows.map((row) => [row.documentId, row])),
    }
  }

  /**
   * ⚠️ `geocoded_addresses` **não tem `company_id`** — a chave é o endereço, e onde uma rua fica não
   * é dado de empresa. O recorte por tenant continua existindo onde importa: as chaves consultadas
   * saem dos documentos que a consulta já filtrou por `companyId`, então esta tabela nunca é a porta
   * por onde um endereço de outra empresa entraria.
   */
  private async loadGeocodedAddresses(
    keys: readonly string[],
  ): Promise<Map<string, Readonly<{ latitude: string; longitude: string; precision: string }>>> {
    const located = new Map<
      string,
      Readonly<{ latitude: string; longitude: string; precision: string }>
    >()
    if (keys.length === 0) return located

    const rows = await this.database
      .select({
        addressKey: geocodedAddresses.addressKey,
        latitude: geocodedAddresses.latitude,
        longitude: geocodedAddresses.longitude,
        precision: geocodedAddresses.precision,
      })
      .from(geocodedAddresses)
      .where(inArray(geocodedAddresses.addressKey, [...keys]))

    for (const row of rows) {
      located.set(row.addressKey, {
        latitude: row.latitude,
        longitude: row.longitude,
        precision: row.precision,
      })
    }
    return located
  }

  private async loadParticipants(
    companyId: string,
    documentIds: readonly string[],
  ): Promise<Map<string, DocumentParticipants>> {
    const result = new Map<string, DocumentParticipants>()
    if (documentIds.length === 0) return result
    const rows = await this.database
      .select({
        documentId: nfeParticipants.documentId,
        role: nfeParticipants.role,
        legalName: nfeParticipants.legalName,
        taxId: nfeParticipants.taxId,
        city: nfeAddresses.city,
        cityCode: nfeAddresses.cityCode,
        district: nfeAddresses.district,
        number: nfeAddresses.number,
        postalCode: nfeAddresses.postalCode,
        state: nfeAddresses.state,
        street: nfeAddresses.street,
      })
      .from(nfeParticipants)
      .leftJoin(
        nfeAddresses,
        and(
          eq(nfeAddresses.companyId, nfeParticipants.companyId),
          eq(nfeAddresses.participantId, nfeParticipants.id),
        ),
      )
      .where(
        and(
          eq(nfeParticipants.companyId, companyId),
          inArray(nfeParticipants.documentId, [...documentIds]),
        ),
      )
    /**
     * A chave é montada **em memória**, com a mesma `buildStopAddressKey` da parada, e não por
     * expressão SQL: normalizar CEP e número no Postgres seria uma segunda implementação da regra,
     * e duas normalizações que discordam produzem endereço que existe na tabela e não é achado.
     */
    const keyByRow = new Map<(typeof rows)[number], string>()
    for (const row of rows) {
      const key = buildStopAddressKey({
        cityCode: row.cityCode,
        number: row.number,
        postalCode: row.postalCode,
      })
      if (key !== null) keyByRow.set(row, key)
    }
    const located = await this.loadGeocodedAddresses([...new Set(keyByRow.values())])

    for (const row of rows) {
      const coordinate = located.get(keyByRow.get(row) ?? '')
      const detail: ParticipantDetail = {
        address: composeAddress(row.street, row.number, row.district),
        addressNumber: row.number,
        city: row.city,
        latitude: coordinate?.latitude ?? null,
        longitude: coordinate?.longitude ?? null,
        locationPrecision: coordinate?.precision ?? null,
        postalCode: row.postalCode,
        cityCode: row.cityCode,
        name: row.legalName ?? '',
        state: row.state,
        taxId: row.taxId,
      }
      const current = result.get(row.documentId) ?? {
        emitter: EMPTY_PARTICIPANT,
        recipient: EMPTY_PARTICIPANT,
      }
      result.set(
        row.documentId,
        row.role === 'emitter'
          ? { ...current, emitter: detail }
          : row.role === 'recipient'
            ? { ...current, recipient: detail }
            : current,
      )
    }
    return result
  }
}

function mapSummary(
  document: DocumentRecord,
  participants: DocumentParticipants | undefined,
  blockContext: DocumentBlockContext,
): NfeDocumentSummary {
  const emitter = participants?.emitter ?? EMPTY_PARTICIPANT
  const recipient = participants?.recipient ?? EMPTY_PARTICIPANT
  const nfseInvoice = blockContext.nfseInvoiceByDocumentId.get(document.id) ?? null
  const volumeTotals = blockContext.volumeTotalsByDocumentId.get(document.id)
  const cargoWeight = resolveCargoWeight({
    defaultWeightPerVolume: blockContext.defaultVolumeWeight,
    volumeGrossWeight: volumeTotals?.grossWeight ?? null,
    volumeQuantity: volumeTotals?.quantity ?? null,
  })
  const eligibilityDocument = {
    grossWeight: cargoWeight?.grossWeight ?? null,
    recipientCity: recipient.city,
    recipientState: recipient.state,
    recipientTaxId: recipient.taxId,
    senderCity: emitter.city,
    senderState: emitter.state,
    senderTaxId: emitter.taxId,
    status: document.status,
    totalAmount: document.totalValue,
    variant: 'complete',
  }
  const links = {
    linkedBatchId: blockContext.batchIdByDocumentId.get(document.id) ?? null,
    linkedNfseInvoiceId: nfseInvoice?.id ?? null,
  }
  const decision = resolveDocumentBlock({ document: eligibilityDocument, ...links })
  const nfseBlockReason = resolveNfseDocumentBlock({ document: eligibilityDocument, ...links })
  const trip = blockContext.tripByDocumentId.get(document.id) ?? null

  return {
    accessKey: document.accessKey,
    cteBlockReason: decision.blocked?.reason ?? null,
    nfseBlockReason,
    emitterAddress: emitter.address,
    emitterCity: emitter.city,
    emitterCityCode: emitter.cityCode,
    emitterName: emitter.name,
    emitterState: emitter.state,
    emitterTaxId: emitter.taxId,
    id: document.id,
    issuedAt: document.issuedAt.toISOString(),
    nfseInvoiceId: nfseInvoice?.id ?? null,
    nfseInvoiceNumber: nfseInvoice?.number ?? null,
    number: document.number,
    recipientAddress: recipient.address,
    recipientCity: recipient.city,
    recipientPostalCode: recipient.postalCode,
    recipientAddressNumber: recipient.addressNumber,
    recipientLatitude: recipient.latitude,
    recipientLongitude: recipient.longitude,
    recipientLocationPrecision: recipient.locationPrecision,
    recipientCityCode: recipient.cityCode,
    recipientName: recipient.name,
    recipientState: recipient.state,
    recipientTaxId: recipient.taxId,
    series: document.series,
    status: document.status,
    totalAmount: document.totalValue,
    tripId: trip?.tripId ?? null,
    tripStatus: trip?.tripStatus ?? null,
    variant: 'complete',
  }
}

function composeAddress(
  street: string | null,
  number: string | null,
  district: string | null,
): string | null {
  const line = [street, number].filter((part) => part !== null && part.length > 0).join(', ')
  const full = [line, district].filter((part) => part !== null && part.length > 0).join(' - ')
  return full.length > 0 ? full : null
}

function decodeCursor(
  value: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (value === null) return null
  const separator = value.lastIndexOf('::')
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + 2)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

function notFound(): ApiError {
  return new ApiError({
    code: 'NFE_DOCUMENT_NOT_FOUND',
    message: 'NF-e document not found',
    status: 404,
  })
}
