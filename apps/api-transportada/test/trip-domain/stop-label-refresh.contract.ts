/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildStopLabel } from '../../src/trips/domain/stop-label.policy.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REPOSITORY_PATH = 'src/trips/infrastructure/drizzle-trip.repository.ts'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * `trip_stops.label` é gravado **uma vez**, na criação da parada, e nunca recalculado. Quando o
 * rótulo passou a levar o número do endereço, toda parada criada antes disso ficou com o texto
 * velho — e a tela seguiu mostrando rua sem número em viagem que já existia.
 *
 * O rótulo passa a ser derivado na leitura, do mesmo `buildStopLabel` que a criação usa. A
 * alternativa — recalcular por migration em SQL — seria a **quarta** grafia de endereço nesta base,
 * e a terceira já divergiu em silêncio (evidência da T001).
 */
describe('o rótulo da parada é recalculado na leitura', () => {
  test('a leitura do detalhe deriva o rótulo, em vez de servir o gravado', async () => {
    const source = await readApplicationFile(REPOSITORY_PATH)

    expect(source).toContain('labelOf(row.stop.id, row.stop.label)')
    expect(source).not.toContain('label: row.stop.label,')
  })

  /** Uma consulta a mais por viagem, nunca uma por parada (§15 do code-standart). */
  test('os endereços saem em lote, como o contato da entrega', async () => {
    const source = await readApplicationFile(REPOSITORY_PATH)

    expect(source).toContain('listStopAddresses')
    expect(source).toContain('inArray')
  })

  /** Sem endereço resolvido o gravado continua valendo: nota desvinculada não apaga o rótulo. */
  test('parada sem endereço resolvido mantém o rótulo gravado', async () => {
    const source = await readApplicationFile(REPOSITORY_PATH)

    expect(source).toContain('return stored')
  })

  test('a política continua omitindo número ausente em vez de imprimir vírgula solta', () => {
    expect(
      buildStopLabel({ city: 'SAO CARLOS', number: '1166', state: 'SP', street: 'RUA A' }),
    ).toBe('RUA A, 1166, SAO CARLOS, SP')
    expect(
      buildStopLabel({ city: 'SAO CARLOS', number: 'S/N', state: 'SP', street: 'RUA A' }),
    ).toBe('RUA A, SAO CARLOS, SP')
  })
})
