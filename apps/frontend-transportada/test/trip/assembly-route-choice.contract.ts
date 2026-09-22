/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 D2/D3: a rota escolhida na montagem é a que a viagem congela. Medido em staging: a
 * escolha era estado local do mapa, nunca saía da tela, e a viagem criada congelava outra rota.
 *
 * ⚠️ Contrato por texto de fonte porque o teste desta app não tem DOM — a fiação é o que se prova
 * aqui; a regra de qual rota reproduzir mora na API, com contrato de comportamento lá.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(path: string): string {
  return readFileSync(new URL(path, APPLICATION_ROOT), 'utf8')
}

describe('a escolha de rota da montagem chega ao planejamento (spec 153)', () => {
  const map = readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')
  const quickCreateHook = readSource('src/modules/trip/hooks/useTripQuickCreate.hook.ts')
  const quickCreateDialog = readSource(
    'src/modules/trip/components/TripQuickCreateDialog.component.tsx',
  )
  const assemblyHook = readSource('src/modules/trip/hooks/useTripRouteAssembly.hook.ts')
  const proposalDetail = readSource('src/modules/trip/components/TripProposalDetail.component.tsx')
  const assemblyDialog = readSource(
    'src/modules/trip/components/TripRouteAssemblyDialog.component.tsx',
  )
  const client = readSource('src/modules/trip/shared/tripClient.service.ts')

  it('o mapa da montagem publica a rota escolhida', () => {
    expect(map).toContain('resolveAssemblyRouteChoice(')
    expect(map).toContain('onRouteChoiceChange')
  })

  /** A sequência (criar → vincular → reordenar → planejar) tem contrato de comportamento próprio. */
  it('a criação rápida passa a escolha para a sequência de criação', () => {
    expect(quickCreateDialog).toContain('onRouteChoiceChange={quickCreate.setRouteChoice}')
    expect(quickCreateHook).toContain('runQuickCreateTrip(')
    expect(quickCreateHook).toContain('...(routeChoice === undefined ? {} : { routeChoice })')
  })

  it('a proposta aceita leva a escolha por caminhão', () => {
    expect(proposalDetail).toContain('onRouteChoiceChange={onRouteChoiceChange}')
    expect(assemblyDialog).toContain('assembly.setVehicleRouteChoice(view.vehicleId, choice)')
    expect(assemblyHook).toContain('{ routeChoiceByVehicle: acceptedRouteChoices }')
    expect(client).toContain('{ routeChoiceByVehicle: input.routeChoiceByVehicle }')
  })

  it('o cliente só manda corpo ao planejar quando há escolha', () => {
    expect(client).toContain('{ body: JSON.stringify({ routeChoice: input.routeChoice }) }')
  })
})
