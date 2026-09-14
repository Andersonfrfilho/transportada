/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const MAPA = 'src/modules/trip/components/TripAssemblyMap.component.tsx'
const LOCALE = 'src/modules/trip/locales/trip.locale.json'

function fonte(caminho: string): string {
  return readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8')
}

describe('as pernas do barracão aparecem na lista (spec 097)', () => {
  /**
   * ⚠️ Medido na tela, com a viagem real de Orlândia/Ipuã: o total dizia **3 h 54 min** e as pernas
   * visíveis somavam 53 km — a ida do barracão e a volta estavam na conta e **em lugar nenhum na
   * tela**. Um número que o operador não consegue reconstruir é um número em que ele não confia, e
   * esta é a tela em que ele decide aceitar carga. Pior: parece erro de cálculo quando é o
   * contrário — é a conta ficando certa pela primeira vez.
   */
  it('imprime a saída do barracão e o retorno, e não só os trechos entre entregas', () => {
    const source = fonte(MAPA)

    expect(source).toContain('assemblyMap.depotLeg.outbound')
    expect(source).toContain('assemblyMap.depotLeg.return')
  })

  it('tem texto para as duas pernas, dizendo de onde e para onde', () => {
    const locale = JSON.parse(fonte(LOCALE)) as {
      assemblyMap: { depotLeg?: Record<string, string> }
    }
    const textos = locale.assemblyMap.depotLeg

    expect(textos?.outbound).toContain('{{distance}}')
    expect(textos?.outbound).toContain('{{duration}}')
    expect(textos?.return).toContain('{{distance}}')
    expect(textos?.return).toContain('{{duration}}')
  })

  /**
   * ⚠️ Sem barracão resolvido não há perna, e a lista volta a ser só das entregas — nada de linha
   * vazia dizendo "0 km", que afirmaria uma saída que não houve.
   */
  it('não desenha perna nenhuma quando o barracão não entrou na rota', () => {
    const source = fonte(MAPA)
    const trecho = source.slice(source.indexOf('depotLeg.outbound') - 400)

    expect(trecho.slice(0, 500)).toContain('depotLegOf')
  })
})
