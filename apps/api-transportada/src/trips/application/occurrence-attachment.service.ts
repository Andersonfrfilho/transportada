/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T3 (RF15/RF26): o ponto único de leitura do anexo da ocorrência de galpão — tabela nova
 * (`trip_document_occurrence_attachments`, D2/D12) quando existem linhas, senão a coluna antiga
 * `attachment_object_id` como anexo único (D6), que por ser anterior às miniaturas sempre vem sem
 * `thumbnailUrl`. `expired` é decidido pela `retention_until` do original (RF22/RF26) — a
 * expiração é a data, não a varredura do expurgo (T17) ter passado.
 *
 * ⚠️ Anexo `expired` **não** gera URL nenhuma, nem de original nem de miniatura: assinar uma URL
 * para um objeto que o expurgo pode apagar a qualquer ciclo é link que aponta para nada.
 */

/** Spec 161: a localização crua de um objeto (original ou miniatura) — quem assina a URL é o chamador. */
export type OccurrenceAttachmentLocation = {
  readonly bucket: string
  readonly mimeType: string
  readonly objectKey: string
  /** ISO 8601. `null` quando o objeto nasceu antes desta spec (anexo da coluna antiga). */
  readonly retentionUntil: string | null
}

export type OccurrenceAttachmentRecord = {
  readonly id: string
  readonly original: OccurrenceAttachmentLocation
  readonly position: number
  /** `null`: foto de WhatsApp (D14), coluna antiga (D6), ou falha de geração no cliente (RF29b). */
  readonly thumbnail: OccurrenceAttachmentLocation | null
}

export type ReadOccurrenceAttachmentsPort = {
  /** `null` quando a ocorrência não tem a coluna antiga preenchida. */
  findLegacyOccurrenceAttachment(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<OccurrenceAttachmentRecord | null>
  /** `[]` quando a ocorrência não tem nenhuma linha na tabela nova. */
  listOccurrenceAttachments(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<readonly OccurrenceAttachmentRecord[]>
}

export type OccurrenceAttachmentDownloadPort = {
  createDownloadUrl(input: {
    readonly bucket: string
    readonly fileName: string
    readonly objectKey: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }>
}

/** RF8: o que a rota publica. ⚠️ Sem `objectKey` e sem `bucket` — ver o comentário do módulo. */
export type OccurrenceAttachmentView = {
  readonly downloadUrl?: string
  readonly expired: boolean
  readonly expiresAt?: string
  readonly id: string
  readonly mimeType: string
  readonly position: number
  readonly thumbnailUrl?: string
}

export type ReadOccurrenceAttachmentsInput = {
  readonly companyId: string
  readonly downloads: OccurrenceAttachmentDownloadPort
  /** Injetável só para teste — o relógio real por padrão. */
  readonly now?: () => Date
  readonly occurrenceId: string
  readonly repository: ReadOccurrenceAttachmentsPort
}

/**
 * RF15: tabela nova quando existem linhas, senão a coluna antiga como anexo único de `position: 1`.
 * As duas fontes nunca se somam — uma ocorrência só grava numa das duas (D6).
 */
export async function readOccurrenceAttachments({
  companyId,
  downloads,
  now,
  occurrenceId,
  repository,
}: ReadOccurrenceAttachmentsInput): Promise<readonly OccurrenceAttachmentView[]> {
  const resolvedNow = (now ?? (() => new Date()))()

  const records = await resolveOccurrenceAttachmentRecords({ companyId, occurrenceId, repository })

  return buildOccurrenceAttachmentViews({ downloads, now: () => resolvedNow, records })
}

/**
 * Spec 161 T10 (RF8/RF10/CA6): a mesma regra de apresentação de `readOccurrenceAttachments` —
 * `expired`, `thumbnailUrl` ausente sem miniatura, nunca `objectKey`/`bucket` — reaproveitada por
 * quem já resolveu os registros por outro caminho (o feed une nota e parada antes de perguntar).
 */
export function buildOccurrenceAttachmentViews(input: {
  readonly downloads: OccurrenceAttachmentDownloadPort
  /** Injetável só para teste — o relógio real por padrão. */
  readonly now?: () => Date
  readonly records: readonly OccurrenceAttachmentRecord[]
}): Promise<readonly OccurrenceAttachmentView[]> {
  const resolvedNow = (input.now ?? (() => new Date()))()
  return Promise.all(
    input.records.map((record) => toView({ downloads: input.downloads, now: resolvedNow, record })),
  )
}

async function resolveOccurrenceAttachmentRecords(input: {
  readonly companyId: string
  readonly occurrenceId: string
  readonly repository: ReadOccurrenceAttachmentsPort
}): Promise<readonly OccurrenceAttachmentRecord[]> {
  const records = await input.repository.listOccurrenceAttachments({
    companyId: input.companyId,
    occurrenceId: input.occurrenceId,
  })
  if (records.length > 0) return records

  const legacy = await input.repository.findLegacyOccurrenceAttachment({
    companyId: input.companyId,
    occurrenceId: input.occurrenceId,
  })
  return legacy === null ? [] : [legacy]
}

async function toView(input: {
  readonly downloads: OccurrenceAttachmentDownloadPort
  readonly now: Date
  readonly record: OccurrenceAttachmentRecord
}): Promise<OccurrenceAttachmentView> {
  const { downloads, now, record } = input

  if (isExpired(record.original.retentionUntil, now)) {
    return {
      expired: true,
      id: record.id,
      mimeType: record.original.mimeType,
      position: record.position,
    }
  }

  const download = await downloads.createDownloadUrl({
    bucket: record.original.bucket,
    fileName: `ocorrencia-${record.id}`,
    objectKey: record.original.objectKey,
  })
  const thumbnail =
    record.thumbnail === null
      ? null
      : await downloads.createDownloadUrl({
          bucket: record.thumbnail.bucket,
          fileName: `ocorrencia-${record.id}-miniatura`,
          objectKey: record.thumbnail.objectKey,
        })

  return {
    downloadUrl: download.url,
    expired: false,
    expiresAt: download.expiresAt,
    id: record.id,
    mimeType: record.original.mimeType,
    position: record.position,
    ...(thumbnail === null ? {} : { thumbnailUrl: thumbnail.url }),
  }
}

function isExpired(retentionUntil: string | null, now: Date): boolean {
  return retentionUntil !== null && new Date(retentionUntil).getTime() < now.getTime()
}
