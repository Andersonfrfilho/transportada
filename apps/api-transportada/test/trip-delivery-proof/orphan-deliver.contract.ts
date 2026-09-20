/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const ROUTES = new URL('../../src/trips/presentation/trip.routes.ts', import.meta.url)
const MAIN = new URL('../../src/main.ts', import.meta.url)
const REPOSITORY = new URL(
  '../../src/trips/infrastructure/drizzle-trip.repository.ts',
  import.meta.url,
)
const USE_CASE = new URL('../../src/trips/application/trip.use-case.ts', import.meta.url)
const PORT = new URL('../../src/trips/application/trip.port.ts', import.meta.url)

/**
 * Spec 079 G020. `repository.deliverDocument` → `useCase.deliverDocument` ficou sem chamador em
 * 02/09/2026, quando a rota de entregar passou para a máquina de estados: gravava `delivered_at`
 * **sem tocar em `separation_status`**, e a viagem nunca chegava a `completed`.
 *
 * Spec 156 T8c: a cadeia inteira (porta, caso de uso e repositório) saiu — nenhuma rota, worker,
 * cron ou fluxo do WhatsApp a chamava. `test/integration/trip-repository.integration.ts` preparava
 * o estado "nota entregue" com ela; passou a usar um `UPDATE` direto de teste
 * (`markTripDocumentDelivered`), que grava as duas colunas junto (`delivered_at` e
 * `separation_status = 'delivered'`), sem reintroduzir a escrita órfã em código de produção.
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

  test('a porta, o caso de uso e o repositório não declaram mais deliverDocument', () => {
    for (const url of [PORT, USE_CASE, REPOSITORY]) {
      expect(readFileSync(url, 'utf8')).not.toInclude('deliverDocument')
    }
  })
})
