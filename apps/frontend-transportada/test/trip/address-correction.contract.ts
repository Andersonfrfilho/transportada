/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripRouteMap.component.tsx',
  import.meta.url,
)
const CLIENT = new URL('../../src/modules/trip/shared/tripClient.service.ts', import.meta.url)

/**
 * Spec 079 T023. A rota `PATCH /geocoded-addresses/:addressKey` **já existia inteira** desde a
 * ADR-0044 (degrau 3 da escada) e **nenhuma tela a usava**: o pino manual existia no servidor e não
 * havia como acioná-lo. Esta task é só a tela.
 */
describe('correção manual do ponto (spec 079 T023)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  /**
   * ⚠️ **A chave não é UUID** — é `cityCode|postalCode|number`, e vai no caminho codificada. Sem
   * `encodeURIComponent` a barra e o pipe quebram a rota, e o servidor responde 404 para um
   * endereço que existe.
   */
  it('codifica a chave do endereço no caminho', () => {
    expect(readFileSync(CLIENT, 'utf8')).toInclude('encodeURIComponent(input.addressKey)')
  })

  /**
   * ⚠️ **A correção é do endereço, não da viagem.** Ela vale para toda viagem que passe por aquele
   * portão, presente e futura (ADR-0044 §3) — e o texto precisa dizer isso, senão quem corrige
   * acha que ajustou só o roteiro que está olhando.
   */
  it('avisa que a correção vale para todas as viagens', () => {
    expect(trip.routeMap.correctionScope.toLowerCase()).toInclude('todas as viagens')
  })

  it('oferece a correção a partir da parada', () => {
    expect(source).toInclude('onCorrect')
  })

  /** Corrigir é escrita: sem `trip.manage` a tela mostra o mapa e não oferece o pino. */
  it('não oferece a correção sem permissão de escrita', () => {
    expect(source).toInclude('canCorrect')
  })
})
