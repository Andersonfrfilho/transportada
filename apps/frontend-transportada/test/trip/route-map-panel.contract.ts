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
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

/** Spec 079 T013. O mapa é desenho nosso, como o da aba Regiões — nada de terceiro na nossa tela. */
describe('o mapa do roteiro na tela (spec 079 T013)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  /**
   * O detalhe desenha **o mesmo mapa da criação da viagem**. Ele tinha um desenho à parte, em
   * contorno de município, e quem montava a viagem num mapa de ruas a reabria num mapa que não
   * reconhecia — sem praça de pedágio nem custo da rota.
   */
  it('desenha pelo mesmo mapa da montagem, com pedágio e custo da rota', () => {
    expect(source).toInclude('<AssemblyVectorMap')
    expect(source).toInclude('<RouteTollSummary')
    expect(source).toInclude('route.fuelTotal')
    expect(source).not.toInclude('<VectorMap')
  })

  /** A cor sai dos tokens: hexadecimal literal é rejeitado em code review (web.md §8). */
  it('não tem cor literal', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/iu)
  })

  /**
   * ⚠️ Parada sem coordenada é **nomeada** fora do mapa. O serviço já as separa; o contrato aqui
   * garante que a tela não descarta a lista que ele devolve — que é o jeito fácil de a regra se
   * perder entre o serviço e o JSX.
   */
  it('nomeia as paradas que ficaram fora do mapa', () => {
    expect(source).toInclude('stopsWithoutLocation')
    expect(trip.routeMap.withoutLocation.toLowerCase()).toInclude('sem localização')
  })

  /** Componente órfão não é entrega. */
  it('está montado no detalhe da viagem', () => {
    expect(readFileSync(DETAIL, 'utf8')).toMatch(/<TripRouteMap[\s/>]/u)
  })
})
