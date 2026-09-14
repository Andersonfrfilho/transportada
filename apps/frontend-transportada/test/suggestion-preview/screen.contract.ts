/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import trip from '@/modules/trip/locales/trip.locale.json'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'

const HOOK = new URL('../../src/modules/trip/hooks/useTripRouteAssembly.hook.ts', import.meta.url)
const PAGE = new URL('../../src/modules/trip/pages/TripWorkspace.page.tsx', import.meta.url)
const DIALOG = new URL(
  '../../src/modules/trip/components/TripRouteAssemblyDialog.component.tsx',
  import.meta.url,
)

/**
 * Contrato **de tela**, e ele existe porque o defeito que previne não aparece em teste de domínio:
 * a API sempre teve as três rotas — ler com paradas, valorar e rejeitar —, e o clique de montar ia
 * direto ao aceite. O operador lia "5 viagens criadas" sem nunca ter visto o que aceitou.
 */
describe('a proposta é revista antes de virar viagem (spec 108)', () => {
  const hook = readFileSync(HOOK, 'utf8')

  /**
   * ⚠️ **A regressão que este contrato existe para impedir.** Propor e aceitar são duas mutações, e
   * a de propor não pode chamar o aceite — se um dia alguém as juntar "para economizar um clique",
   * volta o defeito inteiro.
   */
  test('propor não aceita', () => {
    const propose = hook.slice(
      hook.indexOf('const proposeMutation'),
      hook.indexOf('const acceptMutation'),
    )

    expect(propose).not.toInclude('acceptMultiVehicleSuggestion')
    expect(propose).toInclude('waitForSuggestion')
  })

  test('o aceite é o único caminho que cria viagem', () => {
    const accept = hook.slice(hook.indexOf('const acceptMutation'))

    expect(accept).toInclude('acceptMultiVehicleSuggestion')
    expect(accept).toInclude('input.onCreated')
  })

  /** Descartar avisa a API; sem isso a sugestão fica `ready` para sempre esperando decisão. */
  test('descartar recusa a sugestão', () => {
    expect(hook).toInclude('rejectMultiVehicle')
  })

  /**
   * ⚠️ **Spec 110 D1 reverte o lugar, não a decisão.** A 108 exigia que a proposta estivesse montada
   * com a conta ligada, e ela estava — na tela de viagens, porque era onde o resultado do aceite
   * aparecia. Só que o diálogo que a pediu fechava antes dela: quem escolheu 132 notas, 5 motoristas
   * e 5 veículos perdia de vista o pedido que gerou aquilo.
   *
   * O que a 108 protege continua protegido: a proposta é revista **antes** de virar viagem, e a
   * conta vive junto dela. O que mudou é que as duas coisas agora moram no diálogo.
   */
  test('está montada no diálogo que a pediu, com a conta ligada', () => {
    const dialog = readFileSync(DIALOG, 'utf8')
    const page = readFileSync(PAGE, 'utf8')

    expect(dialog).toInclude('useSuggestionValuation')
    expect(page).not.toInclude('TripRouteAssemblyProposal')
  })

  test('tem rótulo nos dois idiomas', () => {
    for (const dictionary of [trip, tripEn]) {
      const proposal = (dictionary as unknown as Record<string, Record<string, unknown>>)
        .routeAssembly?.proposal as Record<string, string> | undefined

      for (const key of ['title']) {
        expect(proposal?.[key], `falta proposal.${key}`).toBeTruthy()
      }
    }
  })
})
