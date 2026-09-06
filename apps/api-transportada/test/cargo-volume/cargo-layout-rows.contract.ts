/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveCargoLayout } from '../../src/trips/domain/cargo-layout.policy.js'

const PARADAS = [
  { documentsWithoutVolume: 0, label: 'Barrinha', sequence: 1, volumeM3: '2.000000' },
  { documentsWithoutVolume: 0, label: 'Descalvado', sequence: 2, volumeM3: '3.000000' },
  { documentsWithoutVolume: 0, label: 'Campinas', sequence: 3, volumeM3: '1.000000' },
]

/** Multiplica todo volume pelo mesmo fator — é o que trocar a cubagem de reserva faz. */
function escalar(fator: number) {
  return PARADAS.map((parada) => ({
    ...parada,
    volumeM3: (Number.parseFloat(parada.volumeM3) * fator).toFixed(6),
  }))
}

function donos(layout: ReturnType<typeof resolveCargoLayout>): readonly string[] {
  return (layout?.rows ?? []).map((row) => row.label)
}

describe('o baú em fileiras (spec 085 G001)', () => {
  /**
   * ⚠️ **O coração da spec 085.** Medido em 345 NF-e: sem caixa medida, o volume de cada parada é
   * `fator × qVol`, e o fator está no numerador e no denominador da divisão — ele cancela. Este
   * contrato é o que impede alguém de reintroduzir dependência de calibragem sem perceber, e é por
   * isso que ele afirma **igualdade de alocação**, não semelhança.
   *
   * A invariância vale sobre a **divisão entre paradas**, nunca sobre o quanto o baú está cheio:
   * sem capacidade não há denominador, e é exatamente aí que o fator some.
   */
  test('sem capacidade, escalar todos os volumes não muda a divisão entre paradas', () => {
    const base = resolveCargoLayout({ capacityM3: null, stops: PARADAS })
    for (const fator of [0.02, 0.05, 3, 200]) {
      expect(donos(resolveCargoLayout({ capacityM3: null, stops: escalar(fator) }))).toEqual(
        donos(base),
      )
    }
  })

  /** Sem capacidade o baú ainda se divide — o que não existe é a afirmação de quanto sobra. */
  test('sem capacidade há fileiras, e não há espaço livre declarado', () => {
    const layout = resolveCargoLayout({ capacityM3: null, stops: PARADAS })

    expect(layout?.rows.length).toBeGreaterThan(0)
    expect(layout?.freeRows).toBe(0)
    expect(layout?.occupancyKnown).toBe(false)
  })

  /** Com capacidade, o quanto está cheio volta a depender do volume — e é isso que o fator move. */
  test('com capacidade, escalar os volumes muda o espaço livre', () => {
    const magro = resolveCargoLayout({ capacityM3: '60.000000', stops: PARADAS })
    const cheio = resolveCargoLayout({ capacityM3: '60.000000', stops: escalar(6) })

    expect(magro?.occupancyKnown).toBe(true)
    expect(magro!.freeRows).toBeGreaterThan(cheio!.freeRows)
  })

  /** A ordem de carregamento não mudou de significado: `1` é o fundo, e o fundo é da última entrega. */
  test('a última entrega ocupa as fileiras do fundo', () => {
    const rows = resolveCargoLayout({ capacityM3: null, stops: PARADAS })?.rows ?? []

    expect(rows[0]?.label).toBe('Campinas')
    expect(rows[0]?.loadOrder).toBe(1)
    expect(rows.at(-1)?.label).toBe('Barrinha')
  })

  /**
   * ⚠️ É daqui que sai o "dividir na mesma cor": parada grande ocupa fileiras **seguidas**, e a
   * quebra é consequência da quantização — não regra arbitrária escolhendo quando partir a carga.
   */
  test('parada grande ocupa fileiras seguidas, sob a mesma parada', () => {
    const rows = resolveCargoLayout({ capacityM3: null, stops: PARADAS })?.rows ?? []
    const daDescalvado = rows
      .map((row, indice) => ({ indice, label: row.label }))
      .filter((row) => row.label === 'Descalvado')
      .map((row) => row.indice)

    expect(daDescalvado.length).toBeGreaterThan(1)
    expect(daDescalvado).toEqual(
      Array.from({ length: daDescalvado.length }, (_, i) => daDescalvado[0]! + i),
    )
  })

  /**
   * Fatia zero é invisível e some da conferência — a mesma razão que já tira a parada sem cubagem
   * do desenho. Parada minúscula **ainda aparece**, nem que custe a proporção exata.
   */
  test('parada minúscula ainda ganha uma fileira', () => {
    const layout = resolveCargoLayout({
      capacityM3: null,
      stops: [
        { documentsWithoutVolume: 0, label: 'Enorme', sequence: 1, volumeM3: '900.000000' },
        { documentsWithoutVolume: 0, label: 'Migalha', sequence: 2, volumeM3: '0.100000' },
      ],
    })

    expect(donos(layout)).toContain('Migalha')
  })

  /** Mais paradas que fileiras padrão: o baú ganha fileiras, ninguém some. */
  test('viagem com muitas paradas não perde nenhuma', () => {
    const muitas = Array.from({ length: 26 }, (_, indice) => ({
      documentsWithoutVolume: 0,
      label: `Parada ${indice + 1}`,
      sequence: indice + 1,
      volumeM3: '1.000000',
    }))
    const layout = resolveCargoLayout({ capacityM3: null, stops: muitas })

    expect(new Set(donos(layout)).size).toBe(26)
  })

  /** O que já valia continua valendo: excedente fora do baú, parada sem cubagem dita à parte. */
  test('excedente e parada sem cubagem seguem como antes', () => {
    const layout = resolveCargoLayout({
      capacityM3: '3.000000',
      stops: [
        { documentsWithoutVolume: 0, label: 'Cheia', sequence: 1, volumeM3: '4.500000' },
        { documentsWithoutVolume: 2, label: 'Sem volume', sequence: 2, volumeM3: null },
      ],
    })

    expect(layout?.overflowM3).toBe('1.500000')
    expect(layout?.stopsWithoutVolume).toEqual([{ documentCount: 2, label: 'Sem volume' }])
    expect(donos(layout)).not.toContain('Sem volume')
  })
})

describe('a ordem de carregamento lê a porta (spec 085 G003)', () => {
  const PARADAS_ACESSO = [
    { documentsWithoutVolume: 0, label: 'Primeira', sequence: 1, volumeM3: '3.000000' },
    { documentsWithoutVolume: 0, label: 'Segunda', sequence: 2, volumeM3: '3.000000' },
    { documentsWithoutVolume: 0, label: 'Terceira', sequence: 3, volumeM3: '3.000000' },
  ]

  /** Só traseira: o LIFO é obrigação, e nenhuma fileira é alcançável pela lateral. */
  test('veículo que abre só atrás não tem fileira lateral', () => {
    const layout = resolveCargoLayout({
      capacityM3: null,
      loadingAccess: 'rear',
      stops: PARADAS_ACESSO,
    })

    expect(layout?.rows.every((row) => row.sideReachable === false)).toBe(true)
    expect(layout?.orderIsBinding).toBe(true)
  })

  /**
   * ⚠️ Com porta lateral a ordem **ainda ajuda**, mas deixa de ser camisa de força — e o desenho
   * tem de dizer qual carga dá para alcançar sem descarregar o que está na frente.
   */
  test('porta lateral alcança a carga, e a ordem deixa de ser obrigação', () => {
    const layout = resolveCargoLayout({
      capacityM3: null,
      loadingAccess: 'rear_and_side',
      stops: PARADAS_ACESSO,
    })

    expect(layout?.rows.some((row) => row.sideReachable)).toBe(true)
    expect(layout?.orderIsBinding).toBe(false)
  })

  /** Carroceria aberta alcança tudo: a ordem vira conveniência, e o desenho não finge o contrário. */
  test('carroceria aberta alcança todas as fileiras', () => {
    const layout = resolveCargoLayout({
      capacityM3: null,
      loadingAccess: 'open',
      stops: PARADAS_ACESSO,
    })

    expect(layout?.rows.every((row) => row.sideReachable)).toBe(true)
    expect(layout?.orderIsBinding).toBe(false)
  })

  /**
   * ⚠️ Sem acesso declarado o desenho assume o **mais restritivo**. Assumir a lateral por omissão
   * diria que dá para alcançar o meio de um baú que só abre atrás, e quem seguisse carregaria
   * errado — o palpite seguro é sempre o que não promete alcance.
   */
  test('sem acesso declarado, assume só a traseira', () => {
    const layout = resolveCargoLayout({ capacityM3: null, stops: PARADAS_ACESSO })

    expect(layout?.orderIsBinding).toBe(true)
    expect(layout?.rows.every((row) => row.sideReachable === false)).toBe(true)
  })
})
