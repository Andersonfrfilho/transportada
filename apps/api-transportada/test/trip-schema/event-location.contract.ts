/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 D2 / ADR-0081 §2: o evento diz o estado do próprio ponto. Recorte de execução — só as
 * duas tabelas que já têm as quatro colunas de ponto (`trip_stop_events` e `trip_delivery_proofs`);
 * as três sem coluna nenhuma ficam para o resto da spec.
 *
 * Sem o estado, "o GPS falhou", "o prazo apagou" e "não era toque do motorista" são o mesmo `null`,
 * e a tela teria de adivinhar pela idade e pelo tipo. `null` continua sendo **não se aplica** — e é
 * de propósito que ele não vira `unavailable` no histórico: o banco não sabe se o GPS falhou ou se
 * o app daquela época nem pedia posição.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  EVENT_LOCATION_STATES,
  tripDeliveryProofs,
  tripStopEvents,
} from '../../src/database/database.schema.js'
import { columnSqlTypes, unqualifiedCheckSqlByName } from '../fiscal-schema/support.js'

const LOCATED_EVENT_TABLES = [
  ['trip_stop_events', tripStopEvents],
  ['trip_delivery_proofs', tripDeliveryProofs],
] as const

describe('o estado do ponto do evento (spec 196 D2, ADR-0081 §2)', () => {
  test('os três estados são os da D2, sem ENUM nativo', () => {
    expect(Object.values(EVENT_LOCATION_STATES)).toEqual(['captured', 'unavailable', 'expired'])
  })

  test.each(LOCATED_EVENT_TABLES)(
    '%s tem location_state varchar(16) anulável',
    (_tableName, table) => {
      const column = getTableConfig(table).columns.find(
        (candidate) => candidate.name === 'location_state',
      )

      expect(columnSqlTypes(table).location_state).toBe('varchar(16)')
      expect(column?.notNull).toBe(false)
      expect(column?.hasDefault).toBe(false)
    },
  )

  test.each(LOCATED_EVENT_TABLES)('%s restringe o estado ao conjunto', (tableName, table) => {
    const checkSql = unqualifiedCheckSqlByName(table)[`${tableName}_location_state_check`]

    expect(checkSql).toBe(
      `"location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')`,
    )
  })

  /**
   * O texto é afirmado inteiro de propósito: a primeira versão deste CHECK abria com
   * `"location_state" is null or`, o que o fazia aceitar exatamente a linha que ele diz barrar —
   * coordenada com estado nulo. `is not distinct from` é a única forma que não devolve `NULL`, e
   * CHECK que avalia `NULL` passa em Postgres.
   */
  test.each(LOCATED_EVENT_TABLES)(
    '%s amarra captured à existência da coordenada, sem buraco de NULL',
    (tableName, table) => {
      const checkSql =
        unqualifiedCheckSqlByName(table)[`${tableName}_location_state_consistency_check`]

      expect(checkSql).toBe(
        `("location_state" is not distinct from 'captured') = ("latitude" is not null)`,
      )
      expect(checkSql).not.toContain('is null or')
    },
  )
})
