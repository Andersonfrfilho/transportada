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
    expect(proposal).toContain('ValuationLedger')
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
  test('a proposta declara por que ainda não tem praça por trecho', async () => {
    const proposal = await readSource(PROPOSAL)

    expect(proposal).toContain('booths: []')
    expect(proposal).toContain('spec 090 T11')
  })
})
