/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  resolveDocumentFreight,
  type DocumentFreightRule,
} from '../../src/nfe-documents/domain/document-freight.policy.js'
import { normalizeFreightRuleFilters } from '../../src/freight-rules/domain/freight-rule-filters.policy.js'

const ISSUED_AT = new Date('2026-08-20T09:15:00.000Z')

function rule(overrides: Partial<DocumentFreightRule> = {}): DocumentFreightRule {
  return {
    filters: normalizeFreightRuleFilters(undefined),
    freightRuleId: 'rule-a',
    maximumAmount: null,
    minimumAmount: null,
    name: 'Regra A',
    percentage: '0.045000',
    priority: 10n,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
    ...overrides,
  }
}

function resolve(rules: readonly DocumentFreightRule[], totalAmount: string | null = '3042.0000') {
  return resolveDocumentFreight({
    destinationCityCode: '3543402',
    destinationState: 'SP',
    issuedAt: ISSUED_AT,
    rules,
    senderTaxId: '05868574001090',
    totalAmount,
  })
}

describe('frete previsto na listagem de notas', () => {
  it('aplica o percentual da regra vigente e nomeia qual foi', () => {
    const resolved = resolve([rule({ name: 'Spani' })])

    expect(resolved?.amount).toBe('136.8900')
    expect(resolved?.freightRuleName).toBe('Spani')
    expect(resolved?.percentage).toBe('0.045000')
  })

  it('filtro vazio casa com qualquer nota', () => {
    expect(resolve([rule()])).not.toBeNull()
  })

  it('recorte por CNPJ do emitente exclui a nota de outro remetente', () => {
    const filtered = rule({
      filters: normalizeFreightRuleFilters({ senderTaxIds: ['11222333000181'] }),
    })

    expect(resolve([filtered])).toBeNull()
  })

  /** Mesma ordem do seletor da viagem: sem isso a listagem e a parada discordam da mesma nota. */
  it('maior prioridade vence, e no empate de prioridade a vigência mais recente', () => {
    const baixa = rule({
      freightRuleId: 'baixa',
      name: 'Baixa',
      percentage: '0.100000',
      priority: 1n,
    })
    const alta = rule({ freightRuleId: 'alta', name: 'Alta', priority: 10n })

    expect(resolve([baixa, alta])?.freightRuleName).toBe('Alta')

    const antiga = rule({ freightRuleId: 'antiga', name: 'Antiga' })
    const nova = rule({
      freightRuleId: 'nova',
      name: 'Nova',
      validFrom: new Date('2026-06-01T00:00:00.000Z'),
    })

    expect(resolve([antiga, nova])?.freightRuleName).toBe('Nova')
  })

  /**
   * ⚠️ Duas regras igualmente boas devolvem **ausência**, não uma delas. O seletor da viagem escolhe
   * calado (`limit 1`); repetir esse silêncio aqui esconderia a configuração ambígua — que é
   * exatamente o estado em que as duas regras "Spani" chegaram de staging, empatadas em prioridade
   * 10 e vigência 2026-01-01.
   */
  it('empate exato vira ausência, nunca um palpite', () => {
    const primeira = rule({ freightRuleId: 'um', name: 'Spani' })
    const segunda = rule({ freightRuleId: 'dois', name: 'Spani (CNPJ cheio)' })

    expect(resolve([primeira, segunda])).toBeNull()
  })

  it('regra fora de vigência não conta', () => {
    const futura = rule({ validFrom: new Date('2027-01-01T00:00:00.000Z') })
    const encerrada = rule({ validUntil: new Date('2026-01-31T00:00:00.000Z') })

    expect(resolve([futura])).toBeNull()
    expect(resolve([encerrada])).toBeNull()
  })

  it('mínimo e máximo da regra são aplicados', () => {
    expect(resolve([rule({ minimumAmount: '500.0000' })])?.amount).toBe('500.0000')
    expect(resolve([rule({ maximumAmount: '50.0000' })])?.amount).toBe('50.0000')
  })

  /** Nota sem valor não rende zero: ela não tem resposta, e zero seria uma afirmação. */
  it('nota sem valor é ausência', () => {
    expect(resolve([rule()], null)).toBeNull()
  })

  it('nenhuma regra cadastrada é ausência', () => {
    expect(resolve([])).toBeNull()
  })
})
