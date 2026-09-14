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
    /**
     * A conta entra por `TripValuationPreview` — o **mesmo** componente da criação manual, que
     * renderiza o `ValuationLedger` por dentro (spec 111 D2). Uma conta própria aqui divergiria calada.
     */
    expect(source).toContain('<TripValuationPreview')
    /**
     * ⚠️ **Uma lista só do dia.** O expandido teve duas — o mapa da montagem e uma linha do tempo
     * própria —, e elas contavam a mesma sequência: o operador lia "SAO JOAQUIM DA BARRA · 1 nota"
     * na segunda depois de ler o cliente, o endereço, o valor e o peso na primeira. Ficou a rica,
     * que é a da criação manual (D3/D8); a marcação de remoção com "Desfazer" (D6) foi para ela.
     */
    expect(source).toContain('<TripAssemblyMap')
    expect(source).not.toContain('<TripRouteTimeline')
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
   * ⚠️ **A praça aparece no trecho dela, e a tarifa junto** — e não por um segundo cálculo: quem as
   * traz é o mapa, na **mesma** chamada que devolve o traço (spec 090 D4). Duas consultas para o
   * mesmo trajeto podem devolver caminhos diferentes, e aí a tela desenha um e cobra outro.
   *
   * A limitação da spec 090 T11 continua valendo onde ela sempre valeu: na **conta** da sugestão,
   * que sai com `TOLL_NOT_AVAILABLE_IN_SUGGESTION` porque o solver não persiste os `nodeIds`.
   */
  test('a praça vem com a rota, nunca de uma segunda consulta', async () => {
    const source = await readSource('src/modules/trip/components/TripAssemblyMap.component.tsx')

    expect(source).toContain('tollRows')
    expect(source).not.toContain('readTollCost(')
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
