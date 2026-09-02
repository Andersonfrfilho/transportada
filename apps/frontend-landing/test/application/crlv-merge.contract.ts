import { describe, expect, test } from 'bun:test'

import {
  listCrlvDivergences,
  mergeCrlvIntoFields,
  type CrlvDeclaredFields,
} from '../../src/modules/application/shared/crlv.service'

const EMPTY: CrlvDeclaredFields = {
  city: '',
  name: '',
  state: '',
  taxId: '',
  vehicleBrand: '',
  vehicleModel: '',
  vehicleModelYear: '',
  vehiclePlate: '',
}

/** O que `readCrlv` devolve de um CRLV inteiro. */
const READ = {
  brand: 'FIAT',
  model: 'FIORINO ENDURANCE 1.4',
  modelYear: '2021',
  municipality: 'SAO PAULO',
  ownerName: 'MARIA DE SOUSA',
  ownerTaxId: '11144477735',
  plate: 'GCQ8E47',
  state: 'SP',
} as const

describe('o CRLV preenche o campo dele, esteja ele no bloco que estiver', () => {
  test('preenche o bloco Veículo', () => {
    const filled = mergeCrlvIntoFields({ current: EMPTY, values: READ })

    expect(filled.vehiclePlate).toBe('GCQ8E47')
    expect(filled.vehicleBrand).toBe('FIAT')
    expect(filled.vehicleModel).toBe('FIORINO ENDURANCE 1.4')
    expect(filled.vehicleModelYear).toBe('2021')
  })

  /**
   * O caso que torna o princípio concreto: nome e documento são de Dados pessoais e a cidade é de
   * Endereço. Parar no bloco Veículo jogaria fora metade da leitura.
   */
  test('atravessa bloco: nome e documento em Dados pessoais, cidade e UF em Endereço', () => {
    const filled = mergeCrlvIntoFields({ current: EMPTY, values: READ })

    expect(filled.name).toBe('MARIA DE SOUSA')
    expect(filled.taxId).toBe('11144477735')
    expect(filled.city).toBe('SAO PAULO')
    expect(filled.state).toBe('SP')
  })

  test('não sobrescreve nada que a pessoa já digitou', () => {
    const typed: CrlvDeclaredFields = {
      ...EMPTY,
      city: 'Campinas',
      name: 'João Pereira',
      vehiclePlate: 'ABC1D23',
    }

    const filled = mergeCrlvIntoFields({ current: typed, values: READ })

    expect(filled.name).toBe('João Pereira')
    expect(filled.city).toBe('Campinas')
    expect(filled.vehiclePlate).toBe('ABC1D23')
    // e o que estava vazio continua sendo preenchido
    expect(filled.vehicleBrand).toBe('FIAT')
  })

  test('campo que o documento não trouxe fica vazio, sem inventar valor', () => {
    const filled = mergeCrlvIntoFields({ current: EMPTY, values: { plate: 'GCQ8E47' } })

    expect(filled.vehiclePlate).toBe('GCQ8E47')
    expect(filled.name).toBe('')
    expect(filled.city).toBe('')
  })

  /** Leitura vazia é o que o documento de outro tipo produz — e ela não pode preencher nada. */
  test('leitura vazia não preenche campo nenhum', () => {
    expect(mergeCrlvIntoFields({ current: EMPTY, values: {} })).toEqual(EMPTY)
  })
})

describe('o proprietário divergente avisa e não corrige', () => {
  /**
   * Agregado que roda com veículo no nome de terceiro é caso normal: ali o nome lido diverge de
   * propósito de quem se candidata. O aviso é para o operador, não é erro do candidato.
   */
  test('avisa quando o proprietário do veículo não é quem se candidata', () => {
    const typed: CrlvDeclaredFields = { ...EMPTY, name: 'João Pereira', taxId: '52998224725' }

    const divergences = listCrlvDivergences({ current: typed, values: READ })

    expect(divergences).toContainEqual({
      declared: 'JOÃO PEREIRA',
      field: 'name',
      read: 'MARIA DE SOUSA',
    })
    expect(divergences.map((divergence) => divergence.field)).toContain('taxId')
  })

  test('avisando, não corrige: o que foi digitado continua de pé', () => {
    const typed: CrlvDeclaredFields = { ...EMPTY, name: 'João Pereira', taxId: '52998224725' }

    const filled = mergeCrlvIntoFields({ current: typed, values: READ })

    expect(filled.name).toBe('João Pereira')
    expect(filled.taxId).toBe('52998224725')
  })

  test('campo em branco não é divergência — é o que o merge vai preencher', () => {
    expect(listCrlvDivergences({ current: EMPTY, values: READ })).toEqual([])
  })

  test('campo que o documento não trouxe não é divergência', () => {
    const typed: CrlvDeclaredFields = { ...EMPTY, name: 'João Pereira' }

    expect(listCrlvDivergences({ current: typed, values: {} })).toEqual([])
  })

  /** Máscara é do teclado, não do dado: o mesmo CPF escrito de dois jeitos não é conflito. */
  test('compara documento de forma canônica', () => {
    const typed: CrlvDeclaredFields = { ...EMPTY, taxId: '111.444.777-35' }

    expect(listCrlvDivergences({ current: typed, values: READ })).toEqual([])
  })
})
