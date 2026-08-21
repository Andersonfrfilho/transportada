/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture'

const CATALOG_URL = 'https://brasilapi.com.br'

describe('contrato da janela de cache do catálogo de veículos', () => {
  // Marca e modelo da tabela FIPE mudam em escala de mês; um deploy que peça a lista a cada dia
  // paga rede para receber a mesma resposta. O padrão é longo de propósito.
  test('sem a variável, a janela padrão é de trinta dias', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      FLEET_VEHICLE_CATALOG_URL: CATALOG_URL,
    })

    expect(environment.vehicleCatalog).toEqual({ cacheHours: 720, url: CATALOG_URL })
  })

  test('a janela declarada chega à configuração', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      FLEET_VEHICLE_CATALOG_CACHE_HOURS: '24',
      FLEET_VEHICLE_CATALOG_URL: CATALOG_URL,
    })

    expect(environment.vehicleCatalog).toEqual({ cacheHours: 24, url: CATALOG_URL })
  })

  // Zero é a saída para quem precisa ver a resposta do provedor a cada chamada — depurar com
  // cache de um mês é depurar a memória do processo, não o provedor.
  test('zero desliga o cache sem derrubar o boot', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      FLEET_VEHICLE_CATALOG_CACHE_HOURS: '0',
      FLEET_VEHICLE_CATALOG_URL: CATALOG_URL,
    })

    expect(environment.vehicleCatalog).toEqual({ cacheHours: 0, url: CATALOG_URL })
  })

  // Janela inválida é erro de quem preencheu o ambiente. Cair para o padrão em silêncio esconderia
  // o engano até alguém estranhar que a variável não faz nada.
  test.each([
    ['texto', 'um mês'],
    ['negativa', '-1'],
    ['fracionária', '1.5'],
    ['acima de um ano', '8761'],
  ])('falha no boot com janela %s', (_name, value) => {
    expect(() =>
      parseEnvironment({
        ...API_ENVIRONMENT,
        FLEET_VEHICLE_CATALOG_CACHE_HOURS: value,
        FLEET_VEHICLE_CATALOG_URL: CATALOG_URL,
      }),
    ).toThrow()
  })

  // Sem URL não há catálogo, e janela de cache de coisa nenhuma não é configuração — é ruído.
  test('sem URL o catálogo continua desligado, com ou sem janela declarada', () => {
    expect(
      parseEnvironment({
        ...API_ENVIRONMENT,
        FLEET_VEHICLE_CATALOG_CACHE_HOURS: '24',
        FLEET_VEHICLE_CATALOG_URL: '',
      }).vehicleCatalog,
    ).toBeNull()
  })
})
