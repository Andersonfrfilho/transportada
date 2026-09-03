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
 * `trip_stops.label` é gravado **uma vez**, na criação da parada, e nunca recalculado — parada
 * criada antes de o rótulo passar a levar o número guarda o texto velho. O rótulo é derivado na
 * leitura, do mesmo `buildStopLabel` que a criação usa.
 *
 * ⚠️ **A primeira versão deste contrato era decoração**, e é a razão de ele estar escrito assim: ela
 * afirmava que `labelOf` existia e que `label: row.stop.label,` sumira — as duas coisas verdadeiras
 * enquanto a derivação alimentava só o `stops` **intermediário**, o que monta o desenho do baú. A
 * resposta continuava saindo de `mapTripStop`, com o rótulo gravado, e a tela seguiu mostrando rua
 * sem número com gate verde e mutação passando. Por isso o que se cobra agora é o **objeto que a
 * função devolve**, não a existência do auxiliar.
 */
function returnedStopsBlock(source: string): string {
  const start = source.indexOf('stops: stopRecords.map(')
  return start === -1 ? '' : source.slice(start, start + 600)
}

describe('o rótulo da parada é recalculado na leitura', () => {
  test('o objeto devolvido sobrescreve o rótulo depois do spread', async () => {
    const block = returnedStopsBlock(await readApplicationFile(REPOSITORY_PATH))

    expect(block).toContain('...mapTripStop(row.stop)')
    expect(block).toContain('label: labelOf(row.stop.id, row.stop.label)')
    // A ordem é o que decide: sobrescrever antes do spread não sobrevive a ele.
    expect(block.indexOf('...mapTripStop(row.stop)')).toBeLessThan(block.indexOf('label: labelOf('))
  })

  /** Uma consulta a mais por viagem, nunca uma por parada (§15 do code-standart). */
  test('os endereços saem em lote, como o contato da entrega', async () => {
    const source = await readApplicationFile(REPOSITORY_PATH)

    expect(source).toContain('listStopAddresses')
    expect(source).toContain('inArray')
  })

  /** Sem endereço resolvido o gravado continua valendo: nota desvinculada não apaga o rótulo. */
  test('parada sem endereço resolvido mantém o rótulo gravado', async () => {
    expect(await readApplicationFile(REPOSITORY_PATH)).toContain('return stored')
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
