import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 110 D3: **o expandido é a tela de criar viagem, por viagem proposta** — e ele não reimplementa
 * nada. `useTripCargoPreview` recebe notas + veículo e não precisa de viagem criada; `TripCargoPanel`
 * já traz ocupação, silhueta animada e a planta isométrica 3D.
 */
describe('proposal detail contract', () => {
  test('o detalhe reusa a prévia de carga, o painel e o razão — sem componente novo', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalDetail.component.tsx')

    expect(source).toContain('useTripCargoPreview')
    expect(source).toContain('<TripCargoPanel')
    expect(source).toContain('<ValuationLedger')
    expect(source).toContain('<TripRouteTimeline')
    expect(source).toContain('<VehicleIdentityBand')
  })

  /**
   * ⚠️ A faixa do veículo é a **mesma** da criação manual (D8): duas faixas com a mesma informação e
   * caras diferentes é a divergência que o `web.md` §14 reprova.
   */
  test('a faixa do veículo mora na frota, para as duas telas a usarem', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalDetail.component.tsx')

    expect(source).toContain('@/modules/fleet/components/VehicleIdentityBand.component')
  })

  /**
   * ⚠️ A sugestão não persiste os `nodeIds` das praças (spec 090 T11): o pedágio por trecho ainda
   * não existe aqui, e a linha do tempo **não inventa praça nenhuma**. Este contrato existe para o
   * dia em que ele existir — a lista vazia é uma decisão, não um esquecimento.
   */
  test('sem os nós da rota, a linha do tempo não inventa praça', async () => {
    const source = await readSource('src/modules/trip/components/TripProposalDetail.component.tsx')

    expect(source).toContain('booths: []')
    expect(source).toContain('spec 090 T11')
  })

  /**
   * ⚠️ O mapa da montagem aceita ser somente-leitura pelo mesmo padrão de `onStopRemove`: sem o
   * callback o controle não é desenhado. Oferecer setas que reordenam sem recalcular seria oferecer
   * um roteiro que a conta ao lado não descreve.
   */
  test('a ordem do mapa é opcional, e sem ela não há controle inerte', async () => {
    const source = await readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')

    expect(source).toContain('onOrderChange?: ((order: AssemblyCityOrder) => void) | undefined')
    expect(source).toContain('{onOrderChange === undefined ? null : (')
  })
})
