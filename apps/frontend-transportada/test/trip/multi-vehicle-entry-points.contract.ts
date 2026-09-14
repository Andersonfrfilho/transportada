import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * ⚠️ **O produto tem DUAS portas para a mesma decisão**, e a spec 110 reconstruiu só uma.
 *
 * Descoberto ao rodar a smoke no navegador, não por leitura de código: o teste
 * "a distribuição multi-veículo vai da seleção de notas às viagens criadas" atravessa um diálogo
 * **do módulo `routing`**, aberto pela tabela de notas — e não o de "Montar roteiro", que é o que
 * esta feature refez.
 *
 * | Porta | Componente | Tem |
 * |---|---|---|
 * | Notas → "Sugerir viagens" | `routing/MultiVehicleSuggestionDialog` | grupos, conta por veículo |
 * | Viagens → "Montar roteiro" | `trip/TripRouteAssemblyDialog` | + seleção, edição, razão, linha do tempo |
 *
 * Este contrato **não conserta** a divergência: converger ou remover uma das portas é decisão de
 * produto, com spec própria. Ele existe para a divergência ser **visível na suíte** em vez de viver
 * na memória de quem passou por aqui — e para que apagar uma das duas obrigue a atualizar o registro.
 */
describe('multi vehicle entry points contract', () => {
  test('as duas portas existem, e a suíte sabe disso', async () => {
    const table = await readSource(
      'src/modules/nfe-workspace/components/NfeDocumentTable.component.tsx',
    )
    const trips = await readSource('src/modules/trip/pages/TripWorkspace.page.tsx')

    expect(table).toContain('MultiVehicleSuggestionAction')
    expect(trips).toContain('TripRouteAssemblyDialog')
  })

  /** ⚠️ Só a de "Montar roteiro" tem o que a spec 110 entregou. A outra segue como estava. */
  test('a seleção e a edição vivem só na porta que a spec 110 refez', async () => {
    const routing = await readSource(
      'src/modules/routing/components/MultiVehicleSuggestionDialog.component.tsx',
    )
    const trip = await readSource(
      'src/modules/trip/components/TripRouteAssemblyDialog.component.tsx',
    )

    expect(trip).toContain('TripProposalList')
    expect(routing).not.toContain('TripProposalList')
  })

  test('a divergência está registrada na spec, com o que falta decidir', async () => {
    const spec = await Bun.file(
      new URL('../../../../specs/110-a-proposta-se-le-viagem-por-viagem/spec.md', import.meta.url),
    ).text()

    expect(spec).toContain('DUAS portas para a mesma decisão')
  })
})
