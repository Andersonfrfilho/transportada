import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 110 D8: **a criação manual e a proposta contam a mesma conta e desenham o mesmo veículo.**
 *
 * ⚠️ Contrato por texto de fonte porque a segunda implementação **compila igual** — ela só aparece
 * quando os dois números discordam na tela de alguém. Foi assim que o preço do combustível passou a
 * ler só o ajuste manual enquanto a ficha do veículo lia o efetivo (spec 100).
 */
const MANUAL = 'src/modules/trip/components/TripQuickCreateDialog.component.tsx'
const PROPOSAL = 'src/modules/trip/components/TripProposalDetail.component.tsx'
const BAND = '@/modules/fleet/components/VehicleIdentityBand.component'

describe('manual creation convergence contract', () => {
  test('as duas telas desenham a mesma faixa de veículo', async () => {
    const [manual, proposal] = await Promise.all([readSource(MANUAL), readSource(PROPOSAL)])

    expect(manual).toContain(BAND)
    expect(proposal).toContain(BAND)
  })

  test('as duas telas contam a mesma conta', async () => {
    const [preview, proposal] = await Promise.all([
      readSource('src/modules/trip/components/TripValuationPreview.component.tsx'),
      readSource(PROPOSAL),
    ])

    expect(preview).toContain('ValuationLedger')
    /**
     * ⚠️ A proposta não usa só o mesmo razão: usa o mesmo **invólucro** — permissão, esqueleto e
     * vazio incluídos (spec 111 D2). É a convergência inteira, não só a do componente de baixo.
     */
    expect(proposal).toContain('<TripValuationPreview')
  })

  /** ⚠️ Nenhuma das duas tem componente próprio de conta ou de faixa. */
  test('nenhuma das duas reimplementa a conta ou a faixa', async () => {
    const [manual, proposal] = await Promise.all([readSource(MANUAL), readSource(PROPOSAL)])

    for (const source of [manual, proposal]) {
      expect(source).not.toContain('valuationTotals')
      expect(source).not.toContain('buildValuationSteps')
    }
  })

  /**
   * ⚠️ **A criação manual JÁ põe cada praça no trecho dela**, por `legIndex` — a anotação de nós do
   * OSRM agrupada por trecho (spec 090/095). Quem não pode ainda é a **proposta**, porque a sugestão
   * não persiste os `nodeIds` (D4b).
   *
   * Este contrato existe para a direção não se inverter por engano: se alguém remover o
   * `tollRows(legIndex)` do mapa "para igualar as duas telas", estaria igualando pela pior.
   */
  test('a criação manual põe cada praça no trecho dela, e isso não se perde', async () => {
    const map = await readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')
    const geometry = await readSource('src/modules/trip/shared/routeGeometry.service.ts')

    expect(map).toContain('function tollRows(legIndex: number)')
    expect(geometry).toContain('legIndex?: null | number')
  })

  /** E a proposta diz, no próprio fonte, por que a lista dela vai vazia. */
  /**
   * ⚠️ **As duas telas põem a praça no mesmo lugar** — dentro da lista do mapa, no trecho em que ela
   * acontece —, porque é o mesmo componente. O que continua sem pedágio é a **conta** da sugestão
   * (`TOLL_NOT_AVAILABLE_IN_SUGGESTION`): ela precisa dos `nodeIds` que o solver não persiste, e
   * dizer "ninguém lançou" numa tela sem viagem mandaria procurar um botão que não existe.
   */
  test('a praça no trecho dela vale para as duas telas, pelo mesmo mapa', async () => {
    const map = await readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')

    expect(map).toContain('tollRows')
  })
  /**
   * ⚠️ **O mapa é da tela de criar viagem, e agora é das duas** (D3). Sem ele o expandido dizia
   * "SAO JOAQUIM DA BARRA · 1 nota" e mais nada — medido em 2026-09-09 na distribuição real: 24
   * paradas, nenhuma com endereço, cliente ou telefone, que é o que a linha da parada do mapa
   * imprime. O maço já estava carregado na tela; faltava o caminho até aqui.
   */
  test('as duas telas desenham o mesmo mapa da montagem', async () => {
    const [manual, proposal] = await Promise.all([readSource(MANUAL), readSource(PROPOSAL)])

    expect(manual).toContain('<TripAssemblyMap')
    expect(proposal).toContain('<TripAssemblyMap')
  })

  /**
   * ⚠️ **Um mapeador só de nota para ponto.** A cópia compila igual e diverge calada — a tela que
   * ficar com a versão velha some com o telefone do destinatário sem ninguém perceber.
   */
  test('as duas telas montam o ponto do mapa pelo mesmo mapeador', async () => {
    const [manual, proposal] = await Promise.all([readSource(MANUAL), readSource(PROPOSAL)])

    for (const source of [manual, proposal]) {
      expect(source).toContain('toAssemblyMapNote')
      expect(source).not.toContain('function toAssemblyNote(')
    }
  })

  /**
   * ⚠️ **A proposta reordena, e a conta acompanha.** A D6 recusava as setas porque a conta ao lado
   * era a do roteirizador. Hoje o expandido converge com a criação manual por inteiro: a mesma
   * prévia de conta, alimentada pela mesma ordem que o mapa e a carga leem.
   */
  test('a proposta reordena, e a conta é a prévia da mesma ordem', async () => {
    const proposal = await readSource(PROPOSAL)

    expect(proposal).toContain('onOrderChange={onOrderChange}')
    expect(proposal).toContain('useTripValuationPreview({')
    expect(proposal).toContain('<TripValuationPreview preview={valuationPreview} />')
    /** A conta da sugestão, medida na matriz sem nós, não volta para o expandido. */
    expect(proposal).not.toContain('valuation?.valuation ?? null')
  })
})
