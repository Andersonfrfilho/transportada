/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: o repositório dos rascunhos de viagem. A prévia é lida primeiro, pela empresa do
 * contexto (outra empresa é `null`, que a rota responde 404); as três leituras do resto correm juntas.
 */
import type { CargoPreviewTripDraftRepositoryPort } from '../application/cargo-preview.port.js'
import type { Database } from './cargo-arrival-persistence.support.js'
import {
  findExcludedTripDraftDocumentIds,
  selectTripDraftDocuments,
  selectTripDraftItems,
  selectTripDraftPreview,
  selectTripDraftRouteLoads,
} from './cargo-preview-trip-draft.query.js'

export class DrizzleCargoPreviewTripDraftRepository implements CargoPreviewTripDraftRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async findInput(
    params: Parameters<CargoPreviewTripDraftRepositoryPort['findInput']>[0],
  ): ReturnType<CargoPreviewTripDraftRepositoryPort['findInput']> {
    const preview = await selectTripDraftPreview(this.database, params)
    if (preview === null) return null
    const [documents, items, routeLoads, excludedDocumentIds] = await Promise.all([
      selectTripDraftDocuments(this.database, params),
      selectTripDraftItems(this.database, params),
      selectTripDraftRouteLoads(this.database, params),
      findExcludedTripDraftDocumentIds(this.database, params),
    ])
    return {
      documents,
      excludedDocumentIds,
      items,
      preview,
      routeLoads,
    }
  }
}
