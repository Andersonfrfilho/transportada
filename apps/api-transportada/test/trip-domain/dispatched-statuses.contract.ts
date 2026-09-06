/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A lista de estados "na rua" era rederivada em cinco repositórios, com recortes ligeiramente
 * diferentes. Ao acrescentar `on_delivery_route` (ADR-0058), a viagem **sumia** de
 * `/me/trips/current` no instante em que o motorista tocava em iniciar trajeto: uma das cópias não
 * conhecia o estado novo. Este contrato existe para a próxima adição não repetir isso.
 */
import { describe, expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { TRIP_STATUSES, type TripStatus } from '../../src/database/trip.schema.js'
import {
  TRIP_DISPATCHED_STATUSES,
  TRIP_ON_ROAD_STATUSES,
  isTripDispatched,
} from '../../src/trips/domain/trip-state.policy.js'

const INFRASTRUCTURE = new URL('../../src/trips/infrastructure/', import.meta.url).pathname

describe('a lista de estados na rua tem fonte única', () => {
  test('`isTripDispatched` responde exatamente pela lista publicada', () => {
    for (const status of TRIP_STATUSES) {
      expect(isTripDispatched(status)).toBe(
        (TRIP_DISPATCHED_STATUSES as readonly TripStatus[]).includes(status),
      )
    }
  })

  test('a rua agora é a mesma lista sem a viagem que já acabou', () => {
    expect([...TRIP_ON_ROAD_STATUSES, 'completed']).toEqual([...TRIP_DISPATCHED_STATUSES])
  })

  /* O estado que a ADR-0058 acrescentou é rua: sem isso a viagem some da mão do motorista. */
  test('o trajeto iniciado conta como rua nas duas listas', () => {
    expect(TRIP_ON_ROAD_STATUSES).toContain('on_delivery_route')
    expect(TRIP_DISPATCHED_STATUSES).toContain('on_delivery_route')
  })

  /**
   * Por texto de fonte, porque a divergência compila: um repositório com a lista digitada à mão
   * passa em todo teste de caminho feliz e só falha para o motorista que tocou em iniciar trajeto.
   */
  test('nenhum repositório de viagem redigita o par despachada/em trânsito', async () => {
    const files = (await readdir(INFRASTRUCTURE)).filter((name) => name.endsWith('.ts'))
    const offenders: string[] = []

    for (const name of files) {
      const source = await readFile(join(INFRASTRUCTURE, name), 'utf8')
      if (/'dispatched',\s*'in_transit'/u.test(source)) offenders.push(name)
    }

    expect(offenders).toEqual([])
  })
})
