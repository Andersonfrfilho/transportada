import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 110 D1: **a revisão mora no diálogo que a pediu.**
 *
 * ⚠️ Ela era renderizada em `TripWorkspace.page.tsx`, entre os botões de ação e a tabela de viagens,
 * e o diálogo fechava **antes** de ela aparecer: quem passou dois minutos escolhendo 132 notas, 5
 * motoristas e 5 veículos perdia de vista o pedido que gerou aquilo.
 *
 * Contrato por texto de fonte porque a volta ao lugar antigo **compila igual** — ela só aparece para
 * quem estiver com a tela aberta no dia.
 */
describe('proposal placement contract', () => {
  test('a tela de viagens não hospeda mais a proposta', async () => {
    const source = await readSource('src/modules/trip/pages/TripWorkspace.page.tsx')

    expect(source).not.toContain('TripRouteAssemblyProposal')
    expect(source).not.toContain('useSuggestionValuation')
  })

  test('o diálogo hospeda a lista, e a conta da proposta vive com ela', async () => {
    const source = await readSource(
      'src/modules/trip/components/TripRouteAssemblyDialog.component.tsx',
    )

    expect(source).toContain('<TripProposalList')
    expect(source).toContain('useSuggestionValuation')
  })

  /**
   * ⚠️ **O diálogo não fecha ao propor.** Ele fechava, e era isso que mandava a revisão para longe
   * do pedido. Fecha no aceite — e no descarte o operador volta ao formulário com a escolha intacta.
   */
  test('propor não fecha o diálogo; aceitar fecha', async () => {
    const hook = await readSource('src/modules/trip/hooks/useTripRouteAssembly.hook.ts')
    const propose = hook.slice(
      hook.indexOf('const proposeMutation'),
      hook.indexOf('const acceptMutation'),
    )
    const accept = hook.slice(hook.indexOf('const acceptMutation'))

    expect(propose).not.toContain('setIsOpen(false)')
    expect(accept).toContain('setIsOpen(false)')
  })

  /** Com a proposta na tela o formulário recolhe: sem isso a lista nasce duas telas abaixo do topo. */
  test('o pedido recolhe numa faixa quando a proposta chega', async () => {
    const source = await readSource(
      'src/modules/trip/components/TripRouteAssemblyDialog.component.tsx',
    )

    expect(source).toContain('proposalRecap')
    expect(source).toContain("t('routeAssembly.changeRequest')")
  })
})
