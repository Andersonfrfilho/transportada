/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveDepotDescription } from '../../src/trips/domain/depot-description.policy.js'

const PERFIL = {
  city: 'Ribeirão Preto',
  district: 'Distrito Industrial',
  legalName: 'AFR FERNANDES TRANSPORTES E SERVICOS LTDA',
  number: '1000',
  postalCode: '14056680',
  state: 'SP',
  street: 'Avenida do Café',
  tradeName: 'AFR Fernandes Transportes',
} as const

describe('descrição do barracão na perna da montagem', () => {
  test('junta rua, número, bairro, cidade e CEP numa linha só', () => {
    const view = resolveDepotDescription({ phone: '1633334444', profile: PERFIL })

    expect(view?.address).toBe(
      'Avenida do Café, 1000 · Distrito Industrial · Ribeirão Preto/SP · 14056-680',
    )
    expect(view?.tradeName).toBe('AFR Fernandes Transportes')
  })

  /**
   * ⚠️ Telefone ausente é ausência, **nunca** um traço. `company_contacts` está vazia nesta base
   * (medido: zero linhas), então este é o caso normal hoje, não a exceção — e um "—" na linha
   * pareceria defeito de tela e mandaria alguém procurar o número que ninguém cadastrou.
   */
  test('sem contato cadastrado, o telefone é ausência', () => {
    expect(resolveDepotDescription({ phone: null, profile: PERFIL })?.phone).toBeNull()
    expect(resolveDepotDescription({ phone: '   ', profile: PERFIL })?.phone).toBeNull()
  })

  /** Sem nome fantasia quem aparece é a razão social — a linha nunca fica sem quem. */
  test('cai para a razão social quando não há nome fantasia', () => {
    const view = resolveDepotDescription({ phone: null, profile: { ...PERFIL, tradeName: '  ' } })

    expect(view?.tradeName).toBe('AFR FERNANDES TRANSPORTES E SERVICOS LTDA')
  })

  /**
   * ⚠️ Endereço pela metade não vira linha: "—, — · " parece defeito de tela e manda alguém
   * procurar o dado onde ele já está vazio. Sem rua ou sem cidade, a descrição inteira some.
   */
  test('endereço incompleto é ausência, nunca linha pela metade', () => {
    expect(resolveDepotDescription({ phone: null, profile: { ...PERFIL, street: '' } })).toBeNull()
    expect(resolveDepotDescription({ phone: null, profile: { ...PERFIL, city: '  ' } })).toBeNull()
    expect(resolveDepotDescription({ phone: null, profile: null })).toBeNull()
  })

  /** CEP fora dos oito dígitos sai intacto, como o telefone guardado — nunca mascarado à força. */
  test('formata o CEP de oito dígitos e deixa o resto como está', () => {
    const estranho = resolveDepotDescription({
      phone: null,
      profile: { ...PERFIL, postalCode: '1405' },
    })

    expect(estranho?.address).toContain('1405')
    expect(estranho?.address).not.toContain('-')
  })
})
