/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097 D7: sem origem configurada, o barracão é o endereço cadastrado da empresa.
 *
 * Staging, 2026-09-15: `company_route_optimization_settings` tinha zero linhas — nenhuma rota nem
 * tela grava essa tabela — e a montagem dizia "nenhum endereço de origem foi cadastrado" para uma
 * empresa com endereço fiscal completo. A regra aqui é a que a API e o worker aplicam juntos.
 */
import { describe, expect, it } from 'bun:test'

import { resolveDepotOrigin } from '../../src/trips/domain/depot-origin.policy.js'

const COMPANY_ADDRESS = { cityIbgeCode: '3543402', number: 'nº 2296', postalCode: '14076-400' }

describe('de onde a rota parte (spec 097 D7)', () => {
  it('a origem configurada sempre vence o endereço da empresa', () => {
    expect(
      resolveDepotOrigin({ companyAddress: COMPANY_ADDRESS, configuredAddressKey: 'galpao-2' }),
    ).toEqual({ addressKey: 'galpao-2', source: 'route_settings' })
  })

  it('sem linha de configuração, usa o endereço cadastrado da empresa', () => {
    expect(
      resolveDepotOrigin({ companyAddress: COMPANY_ADDRESS, configuredAddressKey: null }),
    ).toEqual({ addressKey: '3543402|14076400|2296', source: 'company_address' })
  })

  /** A coluna nasce `''`: linha existente com origem vazia é o mesmo "não configurado". */
  it('com origem vazia na configuração, usa o endereço cadastrado da empresa', () => {
    expect(
      resolveDepotOrigin({ companyAddress: COMPANY_ADDRESS, configuredAddressKey: '' }),
    ).toEqual({ addressKey: '3543402|14076400|2296', source: 'company_address' })
  })

  /** A chave é a das paradas: é por ela que `geocoded_addresses` guarda a coordenada. */
  it('monta a chave no mesmo formato da parada', () => {
    expect(
      resolveDepotOrigin({
        companyAddress: { cityIbgeCode: '3543402', number: '', postalCode: '14076400' },
        configuredAddressKey: null,
      }),
    ).toEqual({ addressKey: '3543402|14076400|S/N', source: 'company_address' })
  })

  /** D2: nada inventado. Sem perfil ou com CEP incompleto não há chave, e a tela avisa. */
  it('sem perfil fiscal ou com CEP incompleto não há origem', () => {
    expect(resolveDepotOrigin({ companyAddress: null, configuredAddressKey: null })).toBeNull()
    expect(
      resolveDepotOrigin({
        companyAddress: { ...COMPANY_ADDRESS, postalCode: '1407' },
        configuredAddressKey: '',
      }),
    ).toBeNull()
  })
})
