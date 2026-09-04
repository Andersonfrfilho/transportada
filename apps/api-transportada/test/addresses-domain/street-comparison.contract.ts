/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { compareStreetNames } from '../../src/addresses/domain/street-comparison.policy.js'

/**
 * Todos os pares abaixo saíram do lote de 2026-09-04 contra a base real — 45 divergências de rua em
 * 148 endereços medidos. Nenhum é inventado, e é por isso que eles valem como contrato: o
 * classificador existe para separar **estas** quarenta e cinco, não uma amostra imaginada.
 */
const MESMA_RUA: readonly (readonly [string, string])[] = [
  ['AVENIDA VER CARLOS ALBERS JR', 'Rua Vereador Carlos Albers Júnior'],
  ['RUA D. PEDRO II', 'Rua Dom Pedro II'],
  ['R CEL AUGUSTO BARBOSA', 'Rua Coronel Augusto Barbosa'],
  ['RUA CAP AUGUSTO DE ALMEIDA', 'Rua Capitão Augusto de Almeida'],
  ['RUA 7 DE SETEMBRO', 'Rua Sete de Setembro'],
  ['RUA 13 DE MAIO', 'Rua Treze de Maio'],
  ['AVENIDA 22 DE MAIO', 'Avenida Vinte e Dois de Maio'],
  ['RUA 10B', 'Rua 10 B'],
  ['RUA RUA MINAS GERAIS', 'Rua Minas Gerais'],
  ['AV AVENIDA OLYMPIO LOPES DA SILVA', 'Avenida Olympio Lopes da Silva'],
  ['RUAMARECHAL DEODORO DA FONSECA', 'Avenida Marechal Deodoro da Fonseca'],
  ['AVENIDA DO DIAMANTE', 'Avenida Diamante'],
]

const SO_GRAFIA: readonly (readonly [string, string])[] = [
  ['RUA RICARDO LIPORATTI', 'Rua Ricardo Liporati'],
  ['RUA CEZARE GALASSI', 'Rua Cesare Galassi'],
  ['RUA CIRO REZENDE', 'Rua Ciro Resende'],
  ['AVENIDA CAMPOS SALLES', 'Avenida Campos Sales'],
  ['RUA PRUDENTE DE MORAES', 'Rua Prudente de Morais'],
  ['RUA MACYR RAMAZINI', 'Rua Macir Ramazini'],
  ['AV HABIB JABALLI', 'Avenida Habibi Jabali'],
  ['RUA JOAO RICARDO DE MELLO', 'Rua João Ricardo de Melo'],
  ['R DR. MATTA', 'Rua Doutor Mata'],
  ['RUA CORONEL LUIZ VENANCIO MARTINS', 'Rua Coronel Luís Venâncio Martins'],
  ['AVENIDA DR. PAULO BORGES DE OLIVEIR', 'Avenida Doutor Paulo Borges de Oliveira'],
  ['AVENIDA MARINA MARIA CHAVES BARCELL', 'Avenida Marina Maria Chaves Barcellos'],
  /** A inicial do nome do meio — abreviada ora pelo cadastro, ora **pelo provedor**. */
  ['AVENIDA DEP EDUARDO V NASSER', 'Avenida Deputado Eduardo Vicente Nasser'],
  ['RUA JOAQUIM FERREIRA GOULART', 'Rua Joaquim F Goulart'],
  ['RUA CONSELHEIRO M.DE BARROS', 'Avenida Conselheiro Moreira de Barros'],
]

const CADASTRO_CURTO: readonly (readonly [string, string])[] = [
  ['RUA MARECHAL FLORIANO', 'Rua Marechal Floriano Peixoto'],
  ['AV SOARES DE OLIVEIRA', 'Avenida Doutor José Aníbal Soares de Oliveira'],
  ['RUA CANDIDO RODRIGUES', 'Rua Doutor Cândido Rodrigues'],
]

/** As seis que sobraram de quarenta e cinco. São estas que o contratante precisa olhar. */
const OUTRO_LUGAR: readonly (readonly [string, string])[] = [
  ['RUA JOAO LOURENCO LEITE', 'Rua São Lourenço'],
  ['R DR. ANTONIO F. CARVALHO', 'Rua Capitão Luiz do Carmo'],
  ['AVENIDA PRESIDENTE CASTELO BRANCO', 'Avenida Júlio Macari'],
  ['RUA VER ESTEVO DE FELIPE', 'Rua Professor Roque de Filipe'],
  ['PRACA SAO SEBASTIAO', 'Rua Doutor Sebastião Adriano'],
  ['RUA EXPEDICIONARIO EXPEDITO MOREIRA', 'Rua Expedicionário Benedito Moreira'],
]

describe('rua da nota contra rua do provedor (spec 084, G8)', () => {
  /**
   * ⚠️ **Sem esta separação o relatório se mata sozinho.** Quarenta e cinco pedidos de correção dos
   * quais quarenta são `DR` contra `Doutor` ensinam o contratante a fechar a página sem ler — e as
   * seis que importam somem junto com o resto.
   */
  test('abreviação, número por extenso e tipo de via duplicado não são divergência', () => {
    for (const [nota, provedor] of MESMA_RUA) {
      expect(compareStreetNames(nota, provedor)).toBe('same')
    }
  })

  test('letra a mais, letra a menos e nome truncado são grafia, não lugar', () => {
    for (const [nota, provedor] of SO_GRAFIA) {
      expect(compareStreetNames(nota, provedor)).toBe('spelling')
    }
  })

  /** Cadastro curto não é erro: o caminhão chega, e a rua é a mesma com o nome inteiro do outro lado. */
  test('nome contido no outro, na ordem, é cadastro curto', () => {
    for (const [nota, provedor] of CADASTRO_CURTO) {
      expect(compareStreetNames(nota, provedor)).toBe('incomplete')
    }
  })

  test('as seis que sobraram são lugar diferente', () => {
    for (const [nota, provedor] of OUTRO_LUGAR) {
      expect(compareStreetNames(nota, provedor)).toBe('different')
    }
  })

  /**
   * ⚠️ **`EXPEDITO` contra `BENEDITO` são três edições, e continuam sendo ruas diferentes.** É o
   * limite deliberado: uma edição casa `MELLO`/`MELO`; três casariam nomes próprios distintos, e o
   * relatório passaria a esconder erro de cadastro em vez de mostrá-lo.
   */
  test('nome próprio trocado não passa por grafia', () => {
    expect(compareStreetNames('EXPEDITO MOREIRA', 'Benedito Moreira')).toBe('different')
    expect(compareStreetNames('JOAO LOURENCO', 'Sao Lourenco')).toBe('different')
  })

  /** Fora de ordem é coincidência de palavras, não a mesma rua contida na outra. */
  test('conter as palavras fora de ordem não é a mesma rua', () => {
    expect(compareStreetNames('RUA BARROS MOREIRA', 'Rua Moreira de Barros Filho')).toBe(
      'different',
    )
  })

  test('vazio de um lado nunca vira semelhança', () => {
    expect(compareStreetNames('', 'Rua Qualquer')).toBe('different')
    expect(compareStreetNames('RUA', 'Rua Qualquer')).toBe('different')
  })
})
