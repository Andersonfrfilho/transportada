/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { type SQL, and, desc, eq, inArray, isNull, lt, ne, or, sum } from 'drizzle-orm'

import { companyCargoSettings } from '../../database/company-cargo-settings.schema.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
import { buildStopAddressKey } from '../../trips/domain/stop-address-key.js'
import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import {
  nfseEmissionProfiles,
  nfseServiceInvoiceDocuments,
  nfseServiceInvoices,
} from '../../database/nfse.schema.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import {
  CTE_BATCH_BLOCK_REASON,
  resolveDocumentBlock,
} from '../../cte-batches/domain/cte-batch-eligibility.policy.js'
import {
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
} from '../../database/cte-emission-profile.schema.js'
import type {
  CteEmissionMatchRole,
  CteMunicipalServicePolicy,
  CteTaker,
} from '../../database/cte-emission-profile.schema.js'
import {
  explainEmissionProfile,
  resolveMunicipalServicePolicy,
} from '../../cte-profiles/domain/emission-profile-resolution.policy.js'
import type {
  EmissionProfileCandidate,
  EmissionProfileNoMatchReason,
} from '../../cte-profiles/domain/emission-profile-resolution.policy.js'
import {
  type DocumentOutputClassification,
  type DocumentOutputProfile,
  classifyDocumentOutput,
} from '../../cte-profiles/domain/document-output.policy.js'
import { resolveCargoWeight } from '../domain/cargo-weight.policy.js'
import { resolveNfseDocumentBlock } from '../domain/nfse-document-block.policy.js'
import { findTripLinks } from '../../cte-batches/infrastructure/cte-batch-selection.query.js'
import type { TripDocumentLink } from '../../cte-batches/application/cte-batch-preview.port.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import {
  normalizeFreightRuleFilters,
  type FreightRuleVersionFilters,
} from '../../freight-rules/domain/freight-rule-filters.policy.js'
import { resolveDocumentFreight } from '../domain/document-freight.policy.js'
import { freightRules, freightRuleVersions } from '../../database/freight.schema.js'
import { ApiError } from '../../shared/api.error.js'
import type {
  DocumentOutputDescription,
  DownloadNfeDocumentXmlResult,
  NfeDocumentDetail,
  NfeDocumentEligibility,
  NfeDocumentOutputClassifierPort,
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
  /**
   * O `<fone>` do endereço, **cru**. O emitente o preenche como quer — com DDD, sem DDD, com
   * pontuação —, e por isso quem imprime é que decide a máscara: normalizar aqui apagaria a
   * diferença entre "o telefone não tem DDD" e "o DDD foi jogado fora".
   */
  readonly phone: string | null
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
  phone: null,
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

/**
 * As regras de frete ativas da empresa, carregadas **uma vez por página**.
 *
 * ⚠️ Não é uma consulta por linha: `freight_rules` é tabela de configuração — três linhas nesta
 * instalação —, e resolver por documento faria N idas ao banco numa página de até mil notas. É o
 * mesmo padrão do preço de combustível na listagem de veículos.
 */
type ActiveFreightRule = {
  readonly filters: FreightRuleVersionFilters
  readonly freightRuleId: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly name: string
  readonly percentage: string
  readonly priority: bigint
  readonly validFrom: Date
  readonly validUntil: Date | null
}

/**
 * O perfil, reduzido ao que a listagem precisa para decidir o portão de serviço municipal e o
 * documento de saída da nota (spec 144 D3).
 */
type MunicipalPolicyProfile = EmissionProfileCandidate &
  DocumentOutputProfile & {
    readonly municipalServicePolicy: CteMunicipalServicePolicy
    /** Quem paga o frete: a prévia do bot congela o tomador (spec 144 D5). */
    readonly taker: CteTaker
    /** A versão entra no hash da prévia: mudar o perfil entre a prévia e o toque é outra prévia. */
    readonly version: string
  }

type GoverningProfile =
  | { readonly profile: MunicipalPolicyProfile; readonly reason?: undefined }
  | { readonly profile?: undefined; readonly reason: EmissionProfileNoMatchReason }

type DocumentBlockContext = {
  readonly batchIdByDocumentId: ReadonlyMap<string, string>
  /**
   * Os perfis de emissão ativos da empresa. A listagem precisa deles porque o portão de serviço
   * municipal é escolha do perfil, e é o perfil que casa com o emitente da nota que manda.
   */
  readonly emissionProfiles: readonly MunicipalPolicyProfile[]
  readonly freightRules: readonly ActiveFreightRule[]
  /** Nulo é estimativa desligada nesta empresa; resolvido uma vez por página, nunca por linha. */
  readonly defaultVolumeWeight: string | null
  readonly volumeTotalsByDocumentId: ReadonlyMap<string, DocumentVolumeTotals>
  readonly nfseInvoiceByDocumentId: ReadonlyMap<string, NfseInvoiceLink>
  /** Spec 065 D4b: sinal de "esta nota já saiu numa viagem". Nenhum bloqueio o lê. */
  readonly tripByDocumentId: ReadonlyMap<string, TripDocumentLink>
}

const EMPTY_BLOCK_CONTEXT: DocumentBlockContext = {
  batchIdByDocumentId: new Map(),
  emissionProfiles: [],
  freightRules: [],
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

export function buildActiveEmissionProfileFilters(companyId: string): readonly SQL[] {
  return [
    eq(cteEmissionProfiles.companyId, companyId),
    eq(cteEmissionProfiles.status, 'active'),
  ] as const as readonly SQL[]
}

/**
 * O perfil NFS-e apontado, casado por `(company_id, id)` — o mesmo par da FK composta. Só o `id`
 * deixaria a consulta atravessar empresa se a FK um dia sumisse; o join repete a garantia.
 */
export function buildNfseProfileJoin(): SQL {
  return and(
    eq(nfseEmissionProfiles.companyId, cteEmissionProfiles.companyId),
    eq(nfseEmissionProfiles.id, cteEmissionProfiles.nfseEmissionProfileId),
  )!
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

export class DrizzleNfeDocumentRepository
  implements NfeDocumentRepositoryPort, NfeDocumentOutputClassifierPort
{
  public constructor(
    private readonly database: Database,
    private readonly storage: NfeStorageGateway,
  ) {}

  /**
   * A classificação que a listagem publica, para um conjunto de notas escolhido por id — a porta do
   * bot (spec 144 D3). Ela passa pelo **mesmo** `mapSummary` da página, e não por uma conta ao lado:
   * duas contas discordariam sobre a mesma nota, e o contrato de paridade cobra isso.
   */
  public async classifyDocumentOutputs(input: {
    readonly context: CompanyContext
    readonly documentIds: readonly string[]
  }): Promise<ReadonlyMap<string, DocumentOutputClassification>> {
    const described = await this.describeDocumentOutputs(input)
    return new Map(
      [...described].map(([documentId, description]) => [documentId, description.classification]),
    )
  }

  /** O que a prévia do bot congela, tirado do mesmo `mapSummary` da página (spec 144 D5). */
  public async describeDocumentOutputs(input: {
    readonly context: CompanyContext
    readonly documentIds: readonly string[]
  }): Promise<ReadonlyMap<string, DocumentOutputDescription>> {
    const described = new Map<string, DocumentOutputDescription>()
    if (input.documentIds.length === 0) return described
    const companyId = input.context.companyId
    const records = await this.database
      .select()
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, companyId),
          inArray(nfeDocuments.id, [...input.documentIds]),
        ),
      )
    const scope: DocumentScope = { companyId, documentIds: records.map((record) => record.id) }
    const [participantsByDocument, blockContext] = await Promise.all([
      this.loadParticipants(scope.companyId, scope.documentIds),
      this.loadBlockContext(scope),
    ])
    for (const record of records) {
      const { governing, summary } = describeDocument(
        record,
        participantsByDocument.get(record.id),
        blockContext,
      )
      described.set(record.id, {
        classification: summary.documentOutput,
        freightAmount: summary.freightAmount,
        number: summary.number,
        profile:
          governing.profile === undefined
            ? null
            : {
                id: governing.profile.id,
                takerTaxId: resolveProfileTakerTaxId(governing.profile.taker, summary),
                version: governing.profile.version,
              },
      })
    }
    return described
  }

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
      emissionProfiles: await this.loadActiveEmissionProfiles(scope.companyId),
      freightRules: await this.loadActiveFreightRules(scope.companyId),
      tripByDocumentId: new Map(tripLinkRows.map((row) => [row.documentId, row])),
    }
  }

  /**
   * As regras ativas da empresa, **uma consulta por página**. `freight_rules` é configuração — três
   * linhas nesta instalação —, e resolvê-la por documento faria mil idas ao banco numa página de mil
   * notas. Mesmo padrão do preço de combustível na listagem de veículos.
   */
  /**
   * Os perfis de emissão ativos com os matchers deles, **uma consulta por página** — mesma razão das
   * regras de frete: perfil é configuração, e resolvê-lo por documento faria mil idas ao banco numa
   * página de mil notas. O status do perfil NFS-e apontado vem no **mesmo** SELECT (spec 144 D3):
   * ativar o perfil de CT-e não confere o NFS-e, e ele pode ter sido desativado depois.
   */
  private async loadActiveEmissionProfiles(
    companyId: string,
  ): Promise<readonly MunicipalPolicyProfile[]> {
    const rows = await this.database
      .select({
        profile: cteEmissionProfiles,
        matcher: cteEmissionProfileMatchers,
        nfseProfileStatus: nfseEmissionProfiles.status,
      })
      .from(cteEmissionProfiles)
      .leftJoin(
        cteEmissionProfileMatchers,
        and(
          eq(cteEmissionProfileMatchers.companyId, cteEmissionProfiles.companyId),
          eq(cteEmissionProfileMatchers.profileId, cteEmissionProfiles.id),
        ),
      )
      .leftJoin(nfseEmissionProfiles, buildNfseProfileJoin())
      .where(and(...buildActiveEmissionProfileFilters(companyId)))

    const profileById = new Map<string, (typeof rows)[number]['profile']>()
    const nfseStatusByProfileId = new Map<string, (typeof rows)[number]['nfseProfileStatus']>()
    const matchersByProfileId = new Map<
      string,
      { matchRole: CteEmissionMatchRole; taxId: string }[]
    >()
    for (const row of rows) {
      profileById.set(row.profile.id, row.profile)
      nfseStatusByProfileId.set(row.profile.id, row.nfseProfileStatus)
      if (row.matcher === null) continue
      const matchers = matchersByProfileId.get(row.profile.id) ?? []
      matchers.push({ matchRole: row.matcher.matchRole, taxId: row.matcher.taxId })
      matchersByProfileId.set(row.profile.id, matchers)
    }

    return [...profileById.values()].map((profile) => ({
      id: profile.id,
      matchMode: profile.matchMode,
      matchers: matchersByProfileId.get(profile.id) ?? [],
      municipalServicePolicy: profile.municipalServicePolicy,
      name: profile.name,
      nfseEmissionProfileId: profile.nfseEmissionProfileId,
      nfseProfileStatus: nfseStatusByProfileId.get(profile.id) ?? null,
      outputDocument: profile.outputDocument,
      priority: profile.priority,
      status: profile.status,
      taker: profile.taker,
      version: profile.version.toString(),
    }))
  }

  private async loadActiveFreightRules(companyId: string): Promise<readonly ActiveFreightRule[]> {
    const rows = await this.database
      .select({ rule: freightRules, version: freightRuleVersions })
      .from(freightRuleVersions)
      .innerJoin(
        freightRules,
        and(
          eq(freightRules.companyId, freightRuleVersions.companyId),
          eq(freightRules.id, freightRuleVersions.freightRuleId),
        ),
      )
      .where(
        and(
          eq(freightRuleVersions.companyId, companyId),
          eq(freightRules.type, 'percentage_of_invoice_total'),
          eq(freightRules.status, 'active'),
          eq(freightRuleVersions.status, 'active'),
        ),
      )

    return rows.map((row) => ({
      filters: normalizeFreightRuleFilters(
        row.version.filters as Parameters<typeof normalizeFreightRuleFilters>[0],
      ),
      freightRuleId: row.rule.id,
      maximumAmount: row.version.maximumAmount,
      minimumAmount: row.version.minimumAmount,
      name: row.rule.name,
      percentage: row.version.percentage,
      priority: row.rule.priority,
      validFrom: row.version.validFrom,
      validUntil: row.version.validUntil,
    }))
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
        phone: nfeAddresses.phone,
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
        phone: row.phone,
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

/**
 * O perfil que rege a nota, ou o motivo de não haver um. Participante ausente é `not_cnpj`: sem o
 * documento de um dos lados não há CNPJ para casar, e é essa a frase que o operador precisa ler.
 */
function findGoverningProfile(
  profiles: readonly MunicipalPolicyProfile[],
  senderTaxId: string | null,
  recipientTaxId: string | null,
): GoverningProfile {
  if (senderTaxId === null || recipientTaxId === null) return { reason: 'not_cnpj' }
  const explanation = explainEmissionProfile({
    invoice: { recipientTaxId, senderTaxId },
    profiles,
  })
  if (explanation.resolution === undefined) return { reason: explanation.reason }
  const profile = profiles.find((candidate) => candidate.id === explanation.resolution.profileId)
  if (profile === undefined) throw new Error('NFE_DOCUMENT_PROFILE_RESOLUTION_MISMATCH')
  return { profile }
}

function mapSummary(
  document: DocumentRecord,
  participants: DocumentParticipants | undefined,
  blockContext: DocumentBlockContext,
): NfeDocumentSummary {
  return describeDocument(document, participants, blockContext).summary
}

/** Tomador `0` é o remetente (o emitente da NF-e), `3` o destinatário; `1`/`2` o CT-e não emite. */
function resolveProfileTakerTaxId(taker: CteTaker, summary: NfeDocumentSummary): string | null {
  if (taker === '0') return summary.emitterTaxId
  if (taker === '3') return summary.recipientTaxId
  return null
}

function describeDocument(
  document: DocumentRecord,
  participants: DocumentParticipants | undefined,
  blockContext: DocumentBlockContext,
): { readonly governing: GoverningProfile; readonly summary: NfeDocumentSummary } {
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
    /**
     * O portão de serviço municipal é escolha do perfil que rege esta nota — casado pelo CNPJ do
     * emitente, como a emissão casaria. Nota sem perfil, empate e participante sem CNPJ caem em
     * `allow`: ninguém escolheu bloquear.
     */
    municipalServicePolicy: resolveMunicipalServicePolicy({
      profiles: blockContext.emissionProfiles,
      recipientTaxId: recipient.taxId,
      senderTaxId: emitter.taxId,
    }),
    recipientCity: recipient.city,
    recipientCityCode: recipient.cityCode,
    recipientState: recipient.state,
    recipientTaxId: recipient.taxId,
    senderCity: emitter.city,
    senderCityCode: emitter.cityCode,
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
  const freight = resolveDocumentFreight({
    destinationCityCode: recipient.cityCode,
    destinationState: recipient.state,
    issuedAt: document.issuedAt,
    rules: blockContext.freightRules,
    senderTaxId: emitter.taxId,
    totalAmount: document.totalValue,
  })
  const decision = resolveDocumentBlock({ document: eligibilityDocument, ...links })
  const nfseBlockReason = resolveNfseDocumentBlock({ document: eligibilityDocument, ...links })
  const governing = findGoverningProfile(
    blockContext.emissionProfiles,
    emitter.taxId,
    recipient.taxId,
  )
  /**
   * Os motivos que já existiam vêm antes: o vínculo com NFS-e é o que acende o atalho para a nota de
   * serviço na tela, e ele não pode ser engolido por "vai para NFS-e".
   */
  const cteBlockReason =
    decision.blocked?.reason ??
    (governing.profile?.outputDocument === 'nfse' ? CTE_BATCH_BLOCK_REASON.outputNfse : null)
  const documentOutput = classifyDocumentOutput(
    governing.profile === undefined
      ? { cteBlockReason, nfseBlockReason, noProfileReason: governing.reason, profile: null }
      : { cteBlockReason, nfseBlockReason, profile: governing.profile },
  )
  const trip = blockContext.tripByDocumentId.get(document.id) ?? null

  const summary: NfeDocumentSummary = {
    accessKey: document.accessKey,
    cteBlockReason,
    documentOutput,
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
    /**
     * ⚠️ O frete da listagem é **previsão pela parametrização vigente**, não receita realizada — a
     * realizada nasce do CT-e emitido. Ele responde a mesma pergunta que a conta da viagem, com a
     * mesma ordem de preferência entre regras, para as duas telas não discordarem da mesma nota.
     */
    freightAmount: freight?.amount ?? null,
    freightRuleName: freight?.freightRuleName ?? null,
    cargoGrossWeight: cargoWeight?.grossWeight ?? null,
    cargoWeightSource: cargoWeight?.source ?? null,
    recipientPhone: recipient.phone,
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
  return { governing, summary }
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
