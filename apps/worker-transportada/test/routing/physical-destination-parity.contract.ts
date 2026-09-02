/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import { resolvePhysicalDestination } from '../../src/routing/domain/physical-destination.policy.js'

const WORKER = new URL('../../src/routing/domain/physical-destination.policy.ts', import.meta.url)
const API = new URL(
  '../../../api-transportada/src/nfe-documents/domain/physical-destination.policy.ts',
  import.meta.url,
)

/**
 * ⚠️ **Cópia por valor, no mesmo padrão de `pool-address-key.ts`.** As apps não importam código uma
 * da outra, e as duas precisam decidir a mesma coisa: qual dos dois endereços da NF-e é a parada.
 *
 * Divergir é caro e calado — a parada que o worker **propõe** e a parada que o aceite **cria**
 * deixam de casar, e o roteiro aceito fica com duas paradas no mesmo portão.
 */
describe('physical destination parity (spec 073 T013)', () => {
  test('the worker copy says exactly what the API copy says', async () => {
    const [worker, api] = await Promise.all([readFile(WORKER, 'utf8'), readFile(API, 'utf8')])

    const normalize = (source: string) =>
      source
        .split('\n')
        // O import da chave é o único ponto que pode divergir: `pool-address-key` aqui,
        // `stop-address-key` lá — e esses dois já são cópia um do outro, com contrato próprio.
        .filter((line) => !line.includes('address-key.js'))
        // O bloco que explica a cópia só existe do lado copiado.
        .filter(
          (line) =>
            !line.includes('Cópia por valor') && !line.includes('physical-destination-parity'),
        )
        .map((line) => line.trimEnd())
        .join('\n')

    const workerBody = normalize(worker).slice(normalize(worker).indexOf('export const'))
    const apiBody = normalize(api).slice(normalize(api).indexOf('export const'))

    expect(workerBody).toBe(apiBody)
  })

  /** A cópia não é só texto: ela decide, e decide igual. */
  test('the worker copy prefers the delivery address', () => {
    const recipient = {
      components: { cityCode: '3549102', number: '400', postalCode: '13872400' },
      origin: 'recipient' as const,
    }
    const delivery = {
      components: { cityCode: '3509502', number: '4500', postalCode: '13052000' },
      origin: 'delivery' as const,
    }

    expect(resolvePhysicalDestination([recipient, delivery])).toEqual(delivery)
    expect(resolvePhysicalDestination([recipient])).toEqual(recipient)
    expect(
      resolvePhysicalDestination([
        recipient,
        { ...delivery, components: { ...delivery.components, postalCode: '13' } },
      ]),
    ).toEqual(recipient)
  })
})

describe('the chosen address never carries the client identity (spec 073 T013)', () => {
  /**
   * ⚠️ O defeito que este contrato existe para pegar já aconteceu uma vez, no passe de revisão:
   * o agrupamento tem **dois ramos** — criar a parada e somar a segunda nota nela — e só o primeiro
   * foi convertido. O segundo seguia lendo `row.recipientTaxId`, e `row` passou a ser a linha
   * **escolhida**: com `<entrega>` vencendo, a parada acumularia o CNPJ de quem recebe a carga no
   * galpão em vez do cliente, e o cadastro de entrega (spec 060) casaria com outro.
   *
   * Endereço vem do destino escolhido; documento continua vindo do destinatário. Cobrado por texto
   * de fonte porque o agrupamento vive dentro de um repositório com banco, e o defeito compila.
   */
  test('never reads the tax id off the chosen destination row', async () => {
    const source = await readFile(
      new URL(
        '../../src/routing/infrastructure/drizzle-route-optimization.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).not.toInclude('row.recipientTaxId')
    expect(source).toInclude("candidates.find((row) => row.role === 'recipient')?.recipientTaxId")
  })
})
