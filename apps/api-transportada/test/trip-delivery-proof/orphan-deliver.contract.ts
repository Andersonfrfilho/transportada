/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const ROUTES = new URL('../../src/trips/presentation/trip.routes.ts', import.meta.url)
const MAIN = new URL('../../src/main.ts', import.meta.url)

/**
 * Spec 079 G020. `repository.deliverDocument` → `useCase.deliverDocument` **ficou sem chamador** em
 * 02/09/2026, quando a rota de entregar passou para a máquina de estados.
 *
 * Ela é a escrita que gravava `delivered_at` **sem tocar em `separation_status`**: a nota ficava
 * `pending` com hora de entrega, a barra não saía de 0% e a viagem nunca chegava a `completed`.
 *
 * ⚠️ **A cadeia não foi removida, e o motivo está escrito.** `test/integration/trip-repository.
 * integration.ts` a usa para preparar o estado "nota entregue" e então provar que o `release` a
 * recusa — e que o tenant vizinho não escreve na nota alheia. Trocá-la ali por um `UPDATE` cru
 * contradiria a regra do produto (`separation_status` nunca muda por UPDATE direto) e enfraqueceria
 * uma cobertura de isolamento por causa de uma limpeza.
 *
 * O que este contrato faz é o que importa: **impedir a religação**. Quem quiser servir uma rota por
 * ela vai esbarrar aqui antes de o defeito voltar a produção.
 *
 * Spec 156 T8b: `tripLifecycle.deliver.execute`/`.return.execute` — a segunda geração, que passava
 * pela máquina de estados mas gravava sem autoria e ficava alcançável pelo `separator` via
 * `trip.manage` — também saíram. Entregar/devolver agora só existem com autoria: `POST
 * .../field-delivery` e `.../field-return` (`trip-field-office.routes.ts`,
 * `trip.report-on-behalf`) para o escritório, e `report-document-delivery.use-case.ts` para o
 * motorista (`/me`). Nenhum dos dois passa por `transitionTripDocument`/`tripLifecycle.deliver`/
 * `.return`.
 */
describe('a escrita órfã de entrega não volta a ser servida', () => {
  test('nenhuma rota chama o caminho antigo de entregar', () => {
    const routes = readFileSync(ROUTES, 'utf8')

    expect(routes).not.toInclude('deliverDocument')
  })

  test('a composição não liga a máquina de estados a deliver/return', () => {
    const main = readFileSync(MAIN, 'utf8')

    expect(main).not.toInclude('trips.deliverDocument')
    expect(main).not.toInclude('tripLifecycle.deliver.execute')
    expect(main).not.toInclude('tripLifecycle.return.execute')
  })
})
