/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2b: os itens da nota da chegada, numa consulta só — a nota entra pela chegada e pela
 * empresa juntas, e os itens vêm por junção à esquerda para a nota sem item (lista vazia) não se
 * confundir com a nota fora da chegada (nenhuma linha). Só os campos de conferência: NCM e CFOP
 * ficam de fora, como na lista de itens da viagem.
 */
import { and, asc, eq } from 'drizzle-orm'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { nfeProducts } from '../../database/nfe.schema.js'
import type {
  ArrivalDocumentProductsResult,
  ArrivalScope,
  CargoArrivalDocumentProductsReadPort,
} from '../application/cargo-arrival-occurrence.port.js'
import { arrivalExists } from './cargo-arrival-occurrence-read.query.js'
import { buildArrivalDocumentFilters, type Database } from './cargo-arrival-persistence.support.js'

function selectDocumentProducts(
  database: Database,
  scope: ArrivalScope & { readonly nfeDocumentId: string },
) {
  return database
    .select({
      product: {
        code: nfeProducts.code,
        commercialUnit: nfeProducts.commercialUnit,
        description: nfeProducts.description,
        ordinal: nfeProducts.ordinal,
        quantity: nfeProducts.quantity,
        totalValue: nfeProducts.totalValue,
        unitValue: nfeProducts.unitValue,
      },
    })
    .from(cargoArrivalDocuments)
    .leftJoin(
      nfeProducts,
      and(
        eq(nfeProducts.companyId, cargoArrivalDocuments.companyId),
        eq(nfeProducts.documentId, cargoArrivalDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(
        ...buildArrivalDocumentFilters(scope),
        eq(cargoArrivalDocuments.nfeDocumentId, scope.nfeDocumentId),
      ),
    )
    .orderBy(asc(nfeProducts.ordinal))
}

export class DrizzleCargoArrivalDocumentProductsRepository
  implements CargoArrivalDocumentProductsReadPort
{
  public constructor(private readonly database: Database) {}

  public async listArrivalDocumentProducts(
    scope: ArrivalScope & { readonly nfeDocumentId: string },
  ): Promise<ArrivalDocumentProductsResult> {
    const rows = await selectDocumentProducts(this.database, scope)
    if (rows.length === 0) {
      const isArrivalKnown = await arrivalExists(this.database, scope)
      return { outcome: isArrivalKnown ? 'document-not-found' : 'arrival-not-found' }
    }
    return {
      outcome: 'found',
      products: rows.flatMap(({ product }) =>
        product === null ? [] : [{ ...product, ordinal: Number(product.ordinal) }],
      ),
    }
  }
}
