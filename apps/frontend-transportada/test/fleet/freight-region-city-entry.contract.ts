/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  foldRegionCityName,
  resolveRegionCityEntry,
  splitRegionCityNames,
} from '../../src/modules/fleet/shared/regionCityName.service'
import type { FreightRegionCity } from '../../src/modules/fleet/shared/freightRegion.types'

/** A lista do IBGE chega na grafia que `toMunicipalityLabel` produz — caixa mista e acentuada. */
const MUNICIPALITIES = [
  'Barretos',
  'Barrinha',
  'Colina',
  'Mogi Mirim',
  "Santa Bárbara d'Oeste",
  'São Joaquim da Barra',
] as const

function entry(
  overrides: Partial<Parameters<typeof resolveRegionCityEntry>[0]>,
): ReturnType<typeof resolveRegionCityEntry> {
  return resolveRegionCityEntry({
    cities: [],
    municipalities: MUNICIPALITIES,
    names: [],
    state: 'SP',
    ...overrides,
  })
}

function cityNames(cities: readonly FreightRegionCity[]): readonly string[] {
  return cities.map((city) => city.city)
}

describe('freight region city entry contract', () => {
  /**
   * A busca escolhe da lista e a colagem casa contra ela: se as duas portas não caíssem no mesmo
   * nome, a mesma cidade viraria duas linhas na zona conforme como foi digitada.
   */
  test('busca e colagem produzem o mesmo nome canônico', () => {
    const searched = entry({ names: ['Mogi Mirim'] })
    const pasted = entry({ names: ['MOGI-MIRIM'] })

    expect(cityNames(searched.cities)).toEqual(['Mogi Mirim'])
    expect(cityNames(pasted.cities)).toEqual(['Mogi Mirim'])
  })

  test('caixa, acento e pontuação não fazem três cidades', () => {
    const result = entry({ names: ['MOGI-MIRIM', 'mogi mirim', 'Mogi  Mirim'] })

    expect(cityNames(result.cities)).toEqual(['Mogi Mirim'])
    expect(result.duplicated).toEqual(['mogi mirim', 'Mogi  Mirim'])
  })

  test('a grafia gravada é a do IBGE, não a que a pessoa colou', () => {
    const result = entry({ names: ["SANTA BARBARA D'OESTE", 'sao joaquim da barra'] })

    expect(cityNames(result.cities)).toEqual(["Santa Bárbara d'Oeste", 'São Joaquim da Barra'])
  })

  /**
   * A dobra troca pontuação por espaço, então quem apaga o apóstrofo em vez de o separar não casa.
   * É a fronteira certa: adivinhar que `DOESTE` é `D'OESTE` é o palpite silencioso que a spec proíbe
   * — a cidade volta nomeada e a pessoa escolhe da lista.
   */
  test('apóstrofo apagado, e não separado, volta como não reconhecido', () => {
    const result = entry({ names: ['SANTA BARBARA DOESTE'] })

    expect(result.cities).toEqual([])
    expect(result.unmatched).toEqual(['SANTA BARBARA DOESTE'])
  })

  /**
   * O que não casou não entra em silêncio: some da tabela e da conta do frete sem ninguém saber que
   * foi colado. Volta nomeado, com o que a pessoa escreveu, para ela decidir.
   */
  test('nome sem correspondência volta nomeado e não é gravado', () => {
    const result = entry({ names: ['Colina', 'Barrretos', 'Vila Que Não Existe'] })

    expect(cityNames(result.cities)).toEqual(['Colina'])
    expect(result.unmatched).toEqual(['Barrretos', 'Vila Que Não Existe'])
  })

  test('cidade já na zona não entra de novo e volta como repetida', () => {
    const result = entry({
      cities: [{ city: 'Barretos', state: 'SP' }],
      names: ['BARRETOS', 'Colina'],
    })

    expect(cityNames(result.cities)).toEqual(['Barretos', 'Colina'])
    expect(result.duplicated).toEqual(['BARRETOS'])
    expect(result.added).toEqual(['Colina'])
  })

  /**
   * `BARRINHA/SP` e `BARRINHA/MG` são duas cidades: a unicidade da zona é por cidade **e** estado,
   * como o índice do banco, senão a segunda UF nunca entraria.
   */
  test('a mesma cidade em outra UF é cidade nova', () => {
    const result = entry({ cities: [{ city: 'Barrinha', state: 'MG' }], names: ['Barrinha'] })

    expect(result.cities).toEqual([
      { city: 'Barrinha', state: 'MG' },
      { city: 'Barrinha', state: 'SP' },
    ])
    expect(result.duplicated).toEqual([])
  })

  test('a UF entra canônica em caixa alta', () => {
    const result = entry({ names: ['Colina'], state: 'sp' })

    expect(result.cities).toEqual([{ city: 'Colina', state: 'SP' }])
  })

  /** Sem UF não há lista e não há linha: `city` só é único dentro do estado. */
  test('sem UF nada é gravado e o nome volta como não reconhecido', () => {
    const result = entry({ names: ['Colina'], state: '' })

    expect(result.cities).toEqual([])
    expect(result.unmatched).toEqual(['Colina'])
  })

  /**
   * Sem lista o campo volta a ser digitável (provedor do IBGE fora do ar), e o cadastro não pode
   * parar por isso: o que foi digitado entra com a grafia da pessoa.
   */
  test('sem lista do IBGE o nome digitado entra como veio', () => {
    const result = entry({ municipalities: [], names: ['  colina  '] })

    expect(result.cities).toEqual([{ city: 'colina', state: 'SP' }])
    expect(result.unmatched).toEqual([])
  })

  test('a lista colada quebra por linha, vírgula e ponto e vírgula', () => {
    expect(splitRegionCityNames('Colina\nBarretos, Barrinha; Mogi Mirim')).toEqual([
      'Colina',
      'Barretos',
      'Barrinha',
      'Mogi Mirim',
    ])
  })

  test('linha vazia e espaço solto da planilha não viram cidade', () => {
    expect(splitRegionCityNames('Colina\n\n   \r\nBarretos,,\n')).toEqual(['Colina', 'Barretos'])
  })

  test('a dobra tira acento, pontuação, caixa e espaço a mais', () => {
    expect(foldRegionCityName("  Santa Bárbara d'Oeste  ")).toBe('SANTA BARBARA D OESTE')
    expect(foldRegionCityName('MOGI-MIRIM')).toBe(foldRegionCityName('mogi mirim'))
  })
})
