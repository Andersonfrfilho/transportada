/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  AddressComparisonRecord,
  ComparisonCandidate,
} from '../../src/addresses/application/address-comparison.port.js'
import type { AddressLookupResult } from '../../src/addresses/application/address-lookup.port.js'
import { createCompareAddressesBatchUseCase } from '../../src/addresses/application/compare-addresses-batch.use-case.js'

const CANDIDATO: ComparisonCandidate = {
  addressKey: '3527256|14210000|533',
  city: 'LUIS ANTONIO',
  cityCode: '3527256',
  companyId: 'empresa-1',
  district: '',
  latitude: '-21.5550000',
  longitude: '-47.7044000',
  number: '533',
  postalCode: '14210-000',
  precision: 'city',
  state: 'SP',
  street: 'R AMERICA DE ARAUJO PERES',
}

function montar(input: {
  candidatos?: readonly ComparisonCandidate[]
  cidade?: null | string
  resultado: AddressLookupResult | null
}) {
  const gravadas: AddressComparisonRecord[] = []
  const useCase = createCompareAddressesBatchUseCase({
    cityDirectory: { resolveCityCode: async () => input.cidade ?? '3527256' },
    comparisons: {
      findCandidates: async () => input.candidatos ?? [CANDIDATO],
      saveComparison: async (record) => {
        gravadas.push(record)
      },
    },
    lookup: { lookup: async () => input.resultado },
  })

  return { gravadas, useCase }
}

const ACHOU: AddressLookupResult = {
  address: {
    cityName: 'Luís Antônio',
    district: 'Centro',
    number: '533',
    postalCode: '14210-010',
    state: 'SP',
    street: 'Rua Américo de Araújo Píres',
  },
  latitude: '-21.5534349',
  longitude: '-47.7042824',
  matchLevel: 'rooftop',
  placeId: 'ChIJexemplo',
}

const NAO_ACHOU: AddressLookupResult = {
  address: { cityName: '', district: '', number: '', postalCode: '', state: '', street: '' },
  latitude: null,
  longitude: null,
  matchLevel: 'not_found',
  placeId: '',
}

describe('lote de medição de endereço (spec 084, G6 / ADR-0061)', () => {
  test('grava a divergência de rua e de CEP, com a distância medida', async () => {
    const { gravadas, useCase } = montar({ resultado: ACHOU })
    const resumo = await useCase.run({ companyId: 'empresa-1', limit: 200, precisions: ['city'] })

    expect(resumo.compared).toBe(1)
    expect(resumo.byMatchLevel.rooftop).toBe(1)
    expect(resumo.streetDiverging).toBe(1)
    expect(resumo.postalCodeDiverging).toBe(1)

    const [linha] = gravadas
    expect(linha?.providerStreet).toBe('Rua Américo de Araújo Píres')
    expect(linha?.noteStreet).toBe('R AMERICA DE ARAUJO PERES')
    /** Os dois pontos distam ~175 m — a ordem de grandeza do conserto, não o veredito. */
    expect(linha?.distanceMetres).toBeGreaterThan(100)
    expect(linha?.distanceMetres).toBeLessThan(300)
  })

  /**
   * ⚠️ **A linha mais acionável do relatório, e a que quase se perdeu.** `checkCityMatch` descarta
   * resultado sem município identificável — certo, porque cidade desconhecida é indistinguível de
   * cidade errada. Mas quem **não achou nada** não caiu em lugar nenhum: mandá-lo ao portão
   * apagaria justamente o achado de que o texto da nota não existe para o provedor, que é o único
   * que nenhuma correção de coordenada conserta.
   */
  test('não achou nada é medição gravada, não descarte por município', async () => {
    const { gravadas, useCase } = montar({ cidade: null, resultado: NAO_ACHOU })
    const resumo = await useCase.run({ companyId: 'empresa-1', limit: 200, precisions: ['city'] })

    expect(resumo.byMatchLevel.not_found).toBe(1)
    expect(resumo.compared).toBe(1)
    expect(gravadas[0]?.cityMismatch).toBe(false)
    expect(gravadas[0]?.distanceMetres).toBeNull()
  })

  /**
   * ⚠️ **"Não consegui perguntar" nunca vira medição.** Gravar rede fora do ar como `not_found`
   * diria que o provedor não conhece o endereço, e o relatório mandaria o contratante corrigir um
   * cadastro que está certo. A linha fica para a próxima execução.
   */
  test('falha de chamada não grava nada e conta como pulada', async () => {
    const { gravadas, useCase } = montar({ resultado: null })
    const resumo = await useCase.run({ companyId: 'empresa-1', limit: 200, precisions: ['city'] })

    expect(resumo.skipped).toBe(1)
    expect(resumo.compared).toBe(0)
    expect(gravadas).toHaveLength(0)
  })

  /** RF2: resultado em outro município é descartado, e sem distância — ela não significaria nada. */
  test('município divergente descarta a comparação e não mede distância', async () => {
    const { gravadas, useCase } = montar({ cidade: '3543402', resultado: ACHOU })
    const resumo = await useCase.run({ companyId: 'empresa-1', limit: 200, precisions: ['city'] })

    expect(resumo.cityMismatches).toBe(1)
    expect(resumo.streetDiverging).toBe(0)
    expect(gravadas[0]?.distanceMetres).toBeNull()
    /** O texto do provedor continua guardado: é o que permite entender o descarte depois. */
    expect(gravadas[0]?.providerStreet).toBe('Rua Américo de Araújo Píres')
  })

  /** Sem coordenada nossa não há o que comparar — e `null` diz isso, enquanto zero mentiria. */
  test('sem coordenada guardada a distância é nula', async () => {
    const { gravadas, useCase } = montar({
      candidatos: [{ ...CANDIDATO, latitude: null, longitude: null }],
      resultado: ACHOU,
    })
    await useCase.run({ companyId: 'empresa-1', limit: 200, precisions: ['city'] })

    expect(gravadas[0]?.distanceMetres).toBeNull()
  })

  test('o resumo soma os quatro níveis e a empresa viaja na linha', async () => {
    const { gravadas, useCase } = montar({
      candidatos: [CANDIDATO, { ...CANDIDATO, addressKey: 'outra' }],
      resultado: ACHOU,
    })
    const resumo = await useCase.run({ companyId: 'empresa-1', limit: 200, precisions: ['city'] })

    expect(resumo.compared).toBe(2)
    expect(Object.values(resumo.byMatchLevel).reduce((total, value) => total + value, 0)).toBe(2)
    expect(gravadas.every((linha) => linha.companyId === 'empresa-1')).toBe(true)
  })
})
