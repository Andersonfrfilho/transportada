/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoPreviewColumnMap } from '../../cargo-receiving/domain/cargo-preview-workbook.types.js'
import type {
  CargoPreviewFailureCode,
  CargoPreviewStatus,
} from '../../shared/cargo-preview.constant.js'
import type { PreviewItemsPlan } from '../domain/cargo-preview-items.policy.js'

export type PreviewScope = { readonly companyId: string; readonly previewId: string }

export type PreviewToProcess = {
  readonly contractorId: string
  readonly fileSha256: string
  readonly status: CargoPreviewStatus
}

export type PreviewReadingProfile = {
  readonly columnMap: CargoPreviewColumnMap
  readonly sheetName: string | null
}

export type MatchingOutcome = {
  readonly aliasConflicts: number
  readonly changedItems: number
  readonly previews: number
}

export type CargoPreviewWorkerRepositoryPort = {
  findPreview(scope: PreviewScope): Promise<PreviewToProcess | null>
  /** Perfil ligado, com prévia ligada e mapa válido; senão `null` (a prévia falha sem leitor). */
  findReadingProfile(params: {
    readonly companyId: string
    readonly contractorId: string
  }): Promise<PreviewReadingProfile | null>
  /** `queued` → `processing`, só para a tela mostrar que a leitura começou; idempotente. */
  markProcessing(scope: PreviewScope & { readonly now: Date }): Promise<void>
  markFailed(
    scope: PreviewScope & { readonly errorCode: CargoPreviewFailureCode; readonly now: Date },
  ): Promise<void>
  /** Itens, prévia pronta, evento e o primeiro vínculo numa transação; `null` se outra entrega já o fez. */
  storeParsed(
    scope: PreviewScope & {
      readonly contractorId: string
      readonly now: Date
      readonly plan: PreviewItemsPlan
      readonly sheetName: string | null
    },
  ): Promise<MatchingOutcome | null>
  reevaluate(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly now: Date
  }): Promise<MatchingOutcome>
}

/** O leitor só recusa com código estável; o plano é o que a prévia grava. */
export type PreviewWorkbookReading =
  | { readonly code: CargoPreviewFailureCode }
  | { readonly plan: PreviewItemsPlan }

export type CargoPreviewWorkbookReaderPort = {
  /** Passou do teto de tempo, é `PREVIEW_PARSE_TIMEOUT` — resultado, nunca exceção. */
  read(input: {
    readonly bytes: Uint8Array
    readonly profile: PreviewReadingProfile
  }): Promise<PreviewWorkbookReading>
}

export type CargoPreviewObjectReaderPort = {
  /** Objeto ausente é `undefined`: fato do mundo, não falha de infraestrutura. */
  read(location: { readonly bucket: string; readonly key: string }): Promise<Uint8Array | undefined>
}
