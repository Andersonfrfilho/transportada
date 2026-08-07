/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildCtePayload } from '../../src/cte-issuance/domain/cte-payload.builder.js'
import type { CtePayloadInvoice } from '../../src/cte-issuance/domain/cte-payload.types.js'

import {
  GROUPED_ACCESS_KEYS,
  GROUPED_INVOICES,
  GROUPED_RECIPIENT,
  GROUPED_SENDER,
} from './grouped.support.js'
import {
  GOLDEN_ACCESS_KEY,
  GOLDEN_CHARGE_LABEL,
  GOLDEN_INVOICE,
  GOLDEN_OBSERVATIONS,
  GOLDEN_OPERATION_NATURE,
  GOLDEN_PREDOMINANT_PRODUCT,
  GOLDEN_PROFILE,
  GOLDEN_RECIPIENT,
  GOLDEN_SENDER,
  buildGoldenParams,
  expectApiErrorCode,
} from './support.js'

const SECOND_ACCESS_KEY = '35260705868574001090550020008526741408978631'

describe('buildCtePayload — golden CT-e 3526…8240', () => {
  test('reproduz identificação, natureza e municípios da CT-e de referência', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.cfop).toBe('5353')
    expect(payload.naturezaOperacao).toBe(GOLDEN_OPERATION_NATURE)
    expect(payload.tipoServico).toBe('0')
    expect(payload.tomador).toBe('0')
    expect(payload.municipioOrigem).toEqual({ codigo: '3554102', nome: 'Taubate', uf: 'SP' })
    expect(payload.municipioDestino).toEqual({ codigo: '3523701', nome: 'Itirapua', uf: 'SP' })
  })

  test('reproduz remetente e destinatário campo a campo', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.remetente).toEqual({
      cnpj: '05868574001090',
      cep: '12091000',
      cMun: '3554102',
      fone: '2430768250',
      ie: '688292870119',
      nro: '6707',
      uf: 'SP',
      xBairro: 'JARDIM BARONESA',
      xFant: 'TAUBATE-JARDIM BARONESA',
      xLgr: 'AVENIDA DOM PEDRO I',
      xMun: 'Taubate',
      xNome: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
    })
    expect(payload.destinatario).toEqual({
      cnpj: '19354980000159',
      cep: '14420000',
      cMun: '3523701',
      email: 's.docarmomercado@hotmail.com',
      fone: '1688646757',
      ie: '385009288117',
      nro: '5558',
      uf: 'SP',
      xBairro: 'CENTRO',
      xLgr: 'R DOZITO MALVAR RIBAS',
      xMun: 'Itirapua',
      xNome: 'S. DO CARMO ALVES E SILVA',
    })
  })

  test('reproduz vPrest, componentes e carga', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.valorTotalPrestacao).toBe(43.13)
    expect(payload.valorTotalReceber).toBe(43.13)
    expect(payload.componentesValor).toEqual([{ vComp: 43.13, xNome: GOLDEN_CHARGE_LABEL }])
    expect(payload.carga.vCarga).toBe(958.48)
    expect(payload.carga.vCargaAverb).toBe(958.48)
    expect(payload.carga.proPred).toBe(GOLDEN_PREDOMINANT_PRODUCT)
    expect(payload.carga.quantidades).toEqual([
      { cUnid: '03', qCarga: 8, tpMed: 'UN' },
      { cUnid: '01', qCarga: 101.732, tpMed: 'PESO BRUTO' },
      { cUnid: '01', qCarga: 92.765, tpMed: 'PESO LIQUIDO' },
    ])
  })

  test('declara o peso do volume mesmo quando os itens trazem peso próprio', () => {
    const invoice: CtePayloadInvoice = {
      ...GOLDEN_INVOICE,
      products: [
        {
          description: GOLDEN_PREDOMINANT_PRODUCT,
          grossWeight: '10.0000',
          ordinal: 1,
          quantity: '5.0000',
          totalValue: '700.0000',
        },
        {
          description: 'AMACIANTE FOFO 2L',
          grossWeight: '80.0000',
          ordinal: 2,
          quantity: '12.0000',
          totalValue: '258.4800',
        },
      ],
    }

    const payload = buildCtePayload(
      buildGoldenParams({
        invoices: [invoice],
        profile: { ...GOLDEN_PROFILE, predominantProductMode: 'highest_weight' },
      }),
    )

    const declaredGrossWeight = payload.carga.quantidades.find(
      (quantity) => quantity.tpMed === 'PESO BRUTO',
    )

    expect(declaredGrossWeight?.qCarga).toBe(101.732)
    expect(declaredGrossWeight?.qCarga).not.toBe(90)
    expect(payload.carga.quantidades).toEqual([
      { cUnid: '03', qCarga: 8, tpMed: 'UN' },
      { cUnid: '01', qCarga: 101.732, tpMed: 'PESO BRUTO' },
      { cUnid: '01', qCarga: 92.765, tpMed: 'PESO LIQUIDO' },
    ])
    expect(payload.carga.proPred).toBe('AMACIANTE FOFO 2L')
  })

  test('reproduz documentos, modal e observações', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.documentos).toEqual([{ chave: GOLDEN_ACCESS_KEY, tipo: 'nfe' }])
    expect(payload.modal).toEqual({ modal: '01', rntrc: '58151044' })
    expect(payload.informacoesAdicionais).toBe(GOLDEN_OBSERVATIONS)
    expect(payload.icms).toEqual({ cst: '90' })
  })
})

// Os 166 CT-es reais autorizados trazem vCargaAverb igual ao valor das notas — é o valor que a
// seguradora averba. Sem ele a carga viaja sem cobertura declarada no documento fiscal.
describe('buildCtePayload — averbação da carga', () => {
  test('declara o valor de averbação igual ao valor da carga', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.carga.vCargaAverb).toBe(payload.carga.vCarga)
  })

  test('averba a soma das notas quando o CT-e agrupa mais de uma', () => {
    const payload = buildCtePayload(buildGoldenParams({ invoices: GROUPED_INVOICES }))

    expect(payload.carga.vCargaAverb).toBe(430.5)
  })

  test('averba o valor das notas, não o valor da prestação', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.carga.vCargaAverb).not.toBe(payload.valorTotalPrestacao)
  })
})

describe('buildCtePayload — CFOP e partes', () => {
  test('usa o CFOP interestadual quando origem e destino têm UFs diferentes', () => {
    const invoice: CtePayloadInvoice = {
      ...GOLDEN_INVOICE,
      recipient: { ...GOLDEN_RECIPIENT, city: 'Pocos de Caldas', cityCode: '3151800', state: 'MG' },
    }

    const payload = buildCtePayload(buildGoldenParams({ invoices: [invoice] }))

    expect(payload.cfop).toBe('6353')
    expect(payload.municipioDestino).toEqual({
      codigo: '3151800',
      nome: 'Pocos de Caldas',
      uf: 'MG',
    })
  })

  test('mapeia CPF quando a parte tem 11 dígitos', () => {
    const invoice: CtePayloadInvoice = {
      ...GOLDEN_INVOICE,
      sender: { ...GOLDEN_SENDER, stateRegistration: null, taxId: '12345678909' },
    }

    const payload = buildCtePayload(buildGoldenParams({ invoices: [invoice] }))

    expect(payload.remetente.cpf).toBe('12345678909')
    expect(payload.remetente.cnpj).toBeUndefined()
    expect(payload.remetente.ie).toBeUndefined()
  })

  // O complemento distingue sala/andar no mesmo número: sem ele a entrega chega ao prédio errado.
  test('declara o complemento do endereço quando a nota traz um', () => {
    const invoice: CtePayloadInvoice = {
      ...GOLDEN_INVOICE,
      recipient: { ...GOLDEN_RECIPIENT, complement: 'SALA 3' },
      sender: { ...GOLDEN_SENDER, complement: 'GALPAO B' },
    }

    const payload = buildCtePayload(buildGoldenParams({ invoices: [invoice] }))

    expect(payload.remetente.xCpl).toBe('GALPAO B')
    expect(payload.destinatario.xCpl).toBe('SALA 3')
  })

  test('omite o complemento quando a nota não traz', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.remetente).not.toHaveProperty('xCpl')
    expect(payload.destinatario).not.toHaveProperty('xCpl')
  })

  test('rejeita seleção vazia', () => {
    expectApiErrorCode(
      () => buildCtePayload(buildGoldenParams({ invoices: [] })),
      'CTE_PAYLOAD_EMPTY_SELECTION',
    )
  })

  test('rejeita notas com remetentes ou destinatários divergentes', () => {
    const divergent: CtePayloadInvoice = {
      ...GOLDEN_INVOICE,
      accessKey: SECOND_ACCESS_KEY,
      sender: { ...GOLDEN_SENDER, taxId: '05868574001180' },
    }

    expectApiErrorCode(
      () => buildCtePayload(buildGoldenParams({ invoices: [GOLDEN_INVOICE, divergent] })),
      'CTE_PAYLOAD_INCONSISTENT_PARTIES',
    )
  })
})

describe('buildCtePayload — agrupamento de notas', () => {
  test('soma a carga e lista uma infNFe por nota', () => {
    const second: CtePayloadInvoice = {
      ...GOLDEN_INVOICE,
      accessKey: SECOND_ACCESS_KEY,
      products: [
        {
          description: 'CAFE TORRADO 500G',
          grossWeight: null,
          ordinal: 1,
          quantity: '20.0000',
          totalValue: '1200.0000',
        },
      ],
      totalAmount: '1200.0000',
      volumes: [{ grossWeight: '48.5000', netWeight: '40.0000', quantity: '2.0000' }],
    }

    const payload = buildCtePayload(buildGoldenParams({ invoices: [GOLDEN_INVOICE, second] }))

    expect(payload.carga.vCarga).toBe(2158.48)
    expect(payload.carga.proPred).toBe('CAFE TORRADO 500G')
    expect(payload.carga.quantidades).toEqual([
      { cUnid: '03', qCarga: 10, tpMed: 'UN' },
      { cUnid: '01', qCarga: 150.232, tpMed: 'PESO BRUTO' },
      { cUnid: '01', qCarga: 132.765, tpMed: 'PESO LIQUIDO' },
    ])
    expect(payload.documentos).toEqual([
      { chave: GOLDEN_ACCESS_KEY, tipo: 'nfe' },
      { chave: SECOND_ACCESS_KEY, tipo: 'nfe' },
    ])
  })

  test('monta vCarga, documentos e quantidades de um grupo de três notas', () => {
    const payload = buildCtePayload(buildGoldenParams({ invoices: GROUPED_INVOICES }))

    expect(payload.carga.vCarga).toBe(430.5)
    expect(payload.documentos).toEqual([
      { chave: GROUPED_ACCESS_KEYS[0], tipo: 'nfe' },
      { chave: GROUPED_ACCESS_KEYS[1], tipo: 'nfe' },
      { chave: GROUPED_ACCESS_KEYS[2], tipo: 'nfe' },
    ])
    expect(payload.carga.quantidades).toEqual([
      { cUnid: '03', qCarga: 6, tpMed: 'UN' },
      { cUnid: '01', qCarga: 62.75, tpMed: 'PESO BRUTO' },
      { cUnid: '01', qCarga: 53, tpMed: 'PESO LIQUIDO' },
    ])
  })

  test('escolhe o produto predominante entre os itens de todas as notas do grupo', () => {
    const expectedByMode = [
      { mode: 'highest_quantity', product: 'PRODUTO ALFA' },
      { mode: 'highest_value', product: 'PRODUTO CHARLIE' },
      { mode: 'highest_weight', product: 'PRODUTO DELTA' },
    ] as const

    for (const { mode, product } of expectedByMode) {
      const payload = buildCtePayload(
        buildGoldenParams({
          invoices: GROUPED_INVOICES,
          profile: { ...GOLDEN_PROFILE, predominantProductMode: mode },
        }),
      )

      expect(payload.carga.proPred, `modo ${mode}`).toBe(product)
    }
  })

  test('toma remetente, destinatário e municípios da primeira nota do grupo', () => {
    const payload = buildCtePayload(buildGoldenParams({ invoices: GROUPED_INVOICES }))

    expect(payload.remetente.cnpj).toBe(GROUPED_SENDER.taxId)
    expect(payload.destinatario.cnpj).toBe(GROUPED_RECIPIENT.taxId)
    expect(payload.municipioOrigem.codigo).toBe(GROUPED_SENDER.cityCode)
    expect(payload.municipioDestino.codigo).toBe(GROUPED_RECIPIENT.cityCode)
  })

  test('rejeita o grupo quando o destinatário de uma das notas diverge', () => {
    const [first, second, third] = GROUPED_INVOICES as readonly [
      CtePayloadInvoice,
      CtePayloadInvoice,
      CtePayloadInvoice,
    ]
    const divergent: CtePayloadInvoice = {
      ...third,
      recipient: { ...GROUPED_RECIPIENT, taxId: '44555666000253' },
    }

    expectApiErrorCode(
      () => buildCtePayload(buildGoldenParams({ invoices: [first, second, divergent] })),
      'CTE_PAYLOAD_INCONSISTENT_PARTIES',
    )
  })
})

describe('buildCtePayload — produto predominante', () => {
  test('usa o nome fixo do perfil no modo fixed', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        profile: {
          ...GOLDEN_PROFILE,
          predominantProductMode: 'fixed',
          predominantProductName: 'CARGA GERAL',
        },
      }),
    )

    expect(payload.carga.proPred).toBe('CARGA GERAL')
  })

  test('usa o maior peso declarado no modo highest_weight', () => {
    const invoice: CtePayloadInvoice = {
      ...GOLDEN_INVOICE,
      products: [
        {
          description: GOLDEN_PREDOMINANT_PRODUCT,
          grossWeight: '10.0000',
          ordinal: 1,
          quantity: '5.0000',
          totalValue: '700.0000',
        },
        {
          description: 'AMACIANTE FOFO 2L',
          grossWeight: '80.0000',
          ordinal: 2,
          quantity: '12.0000',
          totalValue: '258.4800',
        },
      ],
    }

    const payload = buildCtePayload(
      buildGoldenParams({
        invoices: [invoice],
        profile: { ...GOLDEN_PROFILE, predominantProductMode: 'highest_weight' },
      }),
    )

    expect(payload.carga.proPred).toBe('AMACIANTE FOFO 2L')
  })

  test('cai no peso do volume no modo highest_weight quando a nota não traz peso por item', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        profile: { ...GOLDEN_PROFILE, predominantProductMode: 'highest_weight' },
      }),
    )

    expect(payload.carga.proPred).toBe(GOLDEN_PREDOMINANT_PRODUCT)
  })

  test('rejeita fixed sem nome configurado', () => {
    expectApiErrorCode(
      () =>
        buildCtePayload(
          buildGoldenParams({
            profile: {
              ...GOLDEN_PROFILE,
              predominantProductMode: 'fixed',
              predominantProductName: '',
            },
          }),
        ),
      'CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT',
    )
  })
})

describe('buildCtePayload — ICMS', () => {
  test('CST 00 tributa a prestação integral', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        profile: { ...GOLDEN_PROFILE, icmsCst: '00', icmsRate: '0.120000' },
      }),
    )

    expect(payload.icms).toEqual({ cst: '00', pICMS: 12, vBC: 43.13, vICMS: 5.18 })
  })

  test('CST 20 aplica a redução de base configurada', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        profile: {
          ...GOLDEN_PROFILE,
          icmsBaseReductionRate: '0.200000',
          icmsCst: '20',
          icmsRate: '0.120000',
        },
      }),
    )

    expect(payload.icms).toEqual({ cst: '20', pICMS: 12, pRedBC: 20, vBC: 34.5, vICMS: 4.14 })
  })

  test('CST 40 não carrega base nem alíquota', () => {
    const payload = buildCtePayload(
      buildGoldenParams({ profile: { ...GOLDEN_PROFILE, icmsCst: '40' } }),
    )

    expect(payload.icms).toEqual({ cst: '40' })
  })

  test('rejeita CST 60 por falta de parâmetros de substituição tributária', () => {
    expectApiErrorCode(
      () => buildCtePayload(buildGoldenParams({ profile: { ...GOLDEN_PROFILE, icmsCst: '60' } })),
      'CTE_PAYLOAD_UNSUPPORTED_ICMS',
    )
  })
})

describe('buildCtePayload — retira', () => {
  test('reproduz retira=1 do CT-e de referência sem inventar xDetRetira', () => {
    const payload = buildCtePayload(buildGoldenParams())

    expect(payload.retira).toBe('1')
    expect(payload.xDetRetira).toBeUndefined()
  })

  test('leva a retirada no destino configurada no perfil para o payload', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        profile: {
          ...GOLDEN_PROFILE,
          pickupDetails: 'Retirar na doca 3 das 08h as 17h',
          pickupIndicator: '0',
        },
      }),
    )

    expect(payload.retira).toBe('0')
    expect(payload.xDetRetira).toBe('Retirar na doca 3 das 08h as 17h')
  })

  test('omite xDetRetira quando a retirada não tem detalhe configurado', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        profile: { ...GOLDEN_PROFILE, pickupDetails: '', pickupIndicator: '0' },
      }),
    )

    expect(payload.retira).toBe('0')
    expect(payload.xDetRetira).toBeUndefined()
  })

  test('nunca emite xDetRetira quando o perfil não indica retirada no destino', () => {
    const payload = buildCtePayload(
      buildGoldenParams({
        profile: { ...GOLDEN_PROFILE, pickupDetails: 'texto ignorado', pickupIndicator: '1' },
      }),
    )

    expect(payload.retira).toBe('1')
    expect(payload.xDetRetira).toBeUndefined()
  })
})

describe('buildCtePayload — modal', () => {
  test('rejeita modal não rodoviário', () => {
    expectApiErrorCode(
      () => buildCtePayload(buildGoldenParams({ profile: { ...GOLDEN_PROFILE, modal: '02' } })),
      'CTE_PAYLOAD_UNSUPPORTED_MODAL',
    )
  })
})
