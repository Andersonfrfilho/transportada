/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (T6): as fotos das vagas saem com link assinado de 5 min, gerado aqui — o repositório só sabe onde estão.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  OccurrenceChargeReportFilters,
  OccurrenceChargeReportPage,
  OccurrenceChargeReportPhotoDownloadPort,
  OccurrenceChargeReportPort,
  OccurrenceChargeReportRecord,
  OccurrenceChargeReportRow,
} from './occurrence-charge-report.port.js'

export function createOccurrenceChargeReportUseCase(dependencies: {
  readonly downloads: OccurrenceChargeReportPhotoDownloadPort
  readonly report: OccurrenceChargeReportPort
}): {
  readonly read: {
    execute(input: {
      readonly context: CompanyContext
      readonly filters: OccurrenceChargeReportFilters
    }): Promise<OccurrenceChargeReportPage>
  }
} {
  async function signPhotos(
    record: OccurrenceChargeReportRecord,
  ): Promise<OccurrenceChargeReportRow> {
    const photos = await Promise.all(
      record.photos.map(async (photo) => {
        const link = await dependencies.downloads.createDownloadUrl({
          bucket: photo.bucket,
          fileName: photo.slotKey,
          objectKey: photo.objectKey,
        })
        return {
          expiresAt: link.expiresAt,
          label: photo.label,
          slotKey: photo.slotKey,
          url: link.url,
        }
      }),
    )
    return { ...record, photos }
  }

  return {
    read: {
      async execute(input): Promise<OccurrenceChargeReportPage> {
        const page = await dependencies.report.read({
          companyId: input.context.companyId,
          filters: input.filters,
        })
        return { ...page, items: await Promise.all(page.items.map(signPhotos)) }
      },
    },
  }
}
