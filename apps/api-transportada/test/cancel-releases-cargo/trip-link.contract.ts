/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildActiveTripLinkFilters } from '../../src/cte-batches/infrastructure/cte-batch-selection.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'

const dialect = new PgDialect()

function sqlOf() {
  return dialect.sqlToQuery(
    and(...buildActiveTripLinkFilters({ companyId: COMPANY_ID, documentIds: [DOCUMENT_ID] }))!,
  )
}

describe('o vínculo de viagem que a listagem enxerga (spec 102)', () => {
  /**
   * ⚠️ **O defeito que este contrato tranca.** `findTripLinks` devolvia o vínculo mais recente da
   * nota, **liberado ou não**. A nota que o cancelamento soltou continuava chegando à tela com
   * `tripId` preenchido, e a montagem de roteiro a descartava como "já em viagem" — medido na base
   * local: 324 vínculos liberados ainda visíveis, e o operador sem conseguir selecionar nota.
   *
   * A consulta irmã do vínculo de NFS-e sempre filtrou `cancelled_at is null` pelo mesmo motivo.
   */
  test('esconde o vínculo já liberado', () => {
    expect(sqlOf().sql).toContain('"trip_documents"."released_at" is null')
  })

  test('prende a leitura à empresa do contexto', () => {
    const query = sqlOf()

    expect(query.sql).toContain('"trip_documents"."company_id" = $')
    expect(query.params).toContain(COMPANY_ID)
  })

  /** A nota entra pelos **dois** caminhos de vínculo: a NF-e direta e o cálculo de frete. */
  test('procura pelos dois caminhos de vínculo', () => {
    const query = sqlOf()

    expect(query.sql).toContain('"trip_documents"."nfe_document_id" in (')
    expect(query.sql).toContain('"freight_calculations"."nfe_document_id" in (')
  })
})
