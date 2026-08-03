/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildMdfePayload } from '../../src/mdfe-manifests/domain/mdfe-payload.builder.js'
import {
  MdfePayloadEmptySelectionError,
  MdfePayloadMissingDriverError,
  MdfePayloadMissingCargoNcmError,
  MdfePayloadMissingInsuranceEndorsementError,
  MdfePayloadMissingInsuranceResponsibleError,
  MdfePayloadMissingLoadingCityError,
  MdfePayloadMissingOwnerError,
  MdfePayloadMissingRntrcError,
  MdfePayloadMissingWheelTypeError,
  MdfePayloadTotalsMismatchError,
} from '../../src/mdfe-manifests/domain/mdfe-payload.error.js'
import type { BuildMdfePayloadParams } from '../../src/mdfe-manifests/domain/mdfe-payload.types.js'

const SAO_PAULO_KEY = '35260712345678000195570010000000011000000010'
const BELO_HORIZONTE_KEY = '31260712345678000195570010000000021000000029'
const SECOND_SAO_PAULO_KEY = '35260712345678000195570010000000031000000038'

const params = (overrides: Partial<BuildMdfePayloadParams> = {}): BuildMdfePayloadParams => ({
  companyDefaults: {
    bank: { bankBranch: '', bankCode: '', pixKey: '' },
    insurance: { insurerName: '', insurerTaxId: '', policy: '', responsibility: '' },
  },
  documents: [
    {
      accessKey: SAO_PAULO_KEY,
      cargoValue: '1250.00',
      cargoWeight: '850.0000',
      dischargeCityCode: '3550308',
      dischargeCityName: 'Sao Paulo',
    },
    {
      accessKey: BELO_HORIZONTE_KEY,
      cargoValue: '900.50',
      cargoWeight: '120.5000',
      dischargeCityCode: '3106200',
      dischargeCityName: 'Belo Horizonte',
    },
    {
      accessKey: SECOND_SAO_PAULO_KEY,
      cargoValue: '49.50',
      cargoWeight: '29.5000',
      dischargeCityCode: '3550308',
      dischargeCityName: 'Sao Paulo',
    },
  ],
  drivers: [
    { name: 'Ana Souza', taxId: '12345678901' },
    { name: 'Bruno Lima', taxId: '98765432100' },
  ],
  emitterTaxId: '61156864000191',
  loadingCities: [
    { code: '4106902', name: 'Curitiba' },
    { code: '4205407', name: 'Florianopolis' },
  ],
  manifest: {
    additionalInformation: 'Carga paletizada',
    cargoProduct: 'Bebidas',
    cargoProductNcm: '22021000',
    cargoType: '05',
    cargoUnit: '01',
    cargoValue: '2200.00',
    cargoWeight: '1000.0000',
    contractorName: '',
    contractorTaxId: '',
    destinationState: 'MG',
    dischargePostalCode: '',
    emitterType: '1',
    freightValue: '0.00',
    insuranceEndorsement: '',
    loadingPostalCode: '',
    originState: 'PR',
    rntrc: '12345678',
    transporterType: '1',
    tripStartedAt: '2026-07-28T15:30:00.000Z',
  },
  vehicle: {
    bodyType: '02',
    capacityKg: 25000n,
    capacityM3: 90n,
    ownerName: '',
    ownerRntrc: '',
    ownerState: '',
    ownerTaxId: '',
    ownerTaxRegime: '',
    ownership: 'own',
    plate: 'ABC1D23',
    renavam: '12345678901',
    state: 'PR',
    tareWeightKg: 8000n,
    wheelType: '03',
  },
  ...overrides,
})

describe('MDF-e payload builder', () => {
  test('builds the MdfeData field by field', () => {
    expect(buildMdfePayload(params())).toEqual({
      dataInicioViagem: '2026-07-28T12:30:00-03:00',
      informacoesAdicionais: 'Carga paletizada',
      municipiosCarregamento: [
        { codigo: '4106902', nome: 'Curitiba' },
        { codigo: '4205407', nome: 'Florianopolis' },
      ],
      municipiosDescarga: [
        {
          chavesCte: [SAO_PAULO_KEY, SECOND_SAO_PAULO_KEY],
          codigo: '3550308',
          nome: 'Sao Paulo',
        },
        {
          chavesCte: [BELO_HORIZONTE_KEY],
          codigo: '3106200',
          nome: 'Belo Horizonte',
        },
      ],
      produtoPredominante: { descricao: 'Bebidas', ncm: '22021000', tipoCarga: '05' },
      rntrc: '12345678',
      tipoEmitente: '1',
      totais: { cUnid: '01', qCarga: 1000, vCarga: 2200 },
      ufFim: 'MG',
      ufInicio: 'PR',
      veiculoTracao: {
        capacidadeKg: 25000,
        capacidadeM3: 90,
        condutores: [
          { cpf: '12345678901', nome: 'Ana Souza' },
          { cpf: '98765432100', nome: 'Bruno Lima' },
        ],
        placa: 'ABC1D23',
        renavam: '12345678901',
        tara: 8000,
        tipoCarroceria: '02',
        tipoRodado: '03',
        uf: 'PR',
      },
    })
  })

  test('groups the discharge municipalities by first appearance, not by access key', () => {
    const payload = buildMdfePayload(params())

    expect(payload.municipiosDescarga.map((city) => city.codigo)).toEqual(['3550308', '3106200'])
  })

  test('carries the frozen totals of the manifest, with the scale each field uses', () => {
    const payload = buildMdfePayload(
      params({
        manifest: {
          ...params().manifest,
          cargoValue: '2200.00',
          cargoWeight: '1000.0000',
        },
      }),
    )

    expect(payload.totais).toEqual({ cUnid: '01', qCarga: 1000, vCarga: 2200 })
  })

  test('refuses a manifest whose frozen totals drifted from its documents', () => {
    expect(() =>
      buildMdfePayload(params({ manifest: { ...params().manifest, cargoValue: '2199.99' } })),
    ).toThrow(MdfePayloadTotalsMismatchError)
    expect(() =>
      buildMdfePayload(params({ manifest: { ...params().manifest, cargoWeight: '999.0000' } })),
    ).toThrow(MdfePayloadTotalsMismatchError)
  })

  test('omits every optional field the manifest did not fill', () => {
    const payload = buildMdfePayload(
      params({
        manifest: {
          ...params().manifest,
          additionalInformation: '',
          cargoProduct: '',
          cargoProductNcm: '',
          cargoType: '',
          emitterType: '2',
          rntrc: '',
          transporterType: '',
          tripStartedAt: null,
        },
        vehicle: { ...params().vehicle, capacityM3: 0n, renavam: '' },
      }),
    )

    expect(Object.keys(payload).toSorted()).toEqual([
      'municipiosCarregamento',
      'municipiosDescarga',
      'tipoEmitente',
      'totais',
      'ufFim',
      'ufInicio',
      'veiculoTracao',
    ])
    expect(Object.keys(payload.veiculoTracao).toSorted()).toEqual([
      'capacidadeKg',
      'condutores',
      'placa',
      'tara',
      'tipoCarroceria',
      'tipoRodado',
      'uf',
    ])
  })

  test('keeps the predominant product without the NCM the company did not inform', () => {
    const payload = buildMdfePayload(
      params({ manifest: { ...params().manifest, cargoProductNcm: '' } }),
    )

    expect(payload.produtoPredominante).toEqual({ descricao: 'Bebidas', tipoCarga: '05' })
  })

  // SEFAZ 301: carga lotação exige o NCM do produto predominante
  test('refuses a lotação manifest whose predominant product has no NCM', () => {
    expect(() =>
      buildMdfePayload(
        params({
          manifest: {
            ...params().manifest,
            cargoProductNcm: '',
            dischargePostalCode: '14420000',
            loadingPostalCode: '12091000',
          },
        }),
      ),
    ).toThrow(MdfePayloadMissingCargoNcmError)
  })

  test('lets a manifest without lotação travel with no NCM', () => {
    const payload = buildMdfePayload(
      params({ manifest: { ...params().manifest, cargoProductNcm: '' } }),
    )

    expect(payload.produtoPredominante).toEqual({ descricao: 'Bebidas', tipoCarga: '05' })
  })

  // SEFAZ 745: tpTransp não pode ser informado sem prop no veículo de tração
  test('omits the transporter type when the traction vehicle has no owner', () => {
    expect(buildMdfePayload(params()).tipoTransportador).toBeUndefined()
  })

  test('carries the transporter type when the traction vehicle declares an owner', () => {
    const payload = buildMdfePayload(
      params({
        vehicle: {
          ...params().vehicle,
          ownerName: 'Transportes Parceiros Ltda',
          ownerRntrc: '87654321',
          ownerState: 'SC',
          ownerTaxId: '12345678000195',
          ownerTaxRegime: '0',
          ownership: 'third_party',
        },
      }),
    )

    expect(payload.tipoTransportador).toBe('1')
  })

  test('describes a third-party vehicle with its owner', () => {
    const payload = buildMdfePayload(
      params({
        vehicle: {
          ...params().vehicle,
          ownerName: 'Transportes Parceiros Ltda',
          ownerRntrc: '87654321',
          ownerState: 'SC',
          ownerTaxId: '12345678000195',
          ownerTaxRegime: '0',
          ownership: 'third_party',
        },
      }),
    )

    expect(payload.veiculoTracao.proprietario).toEqual({
      cnpj: '12345678000195',
      nome: 'Transportes Parceiros Ltda',
      rntrc: '87654321',
      tipoProprietario: '0',
      uf: 'SC',
    })
  })

  test('reads an owner CPF as CPF instead of CNPJ', () => {
    const payload = buildMdfePayload(
      params({
        vehicle: {
          ...params().vehicle,
          ownerName: 'Jose Motorista',
          ownerRntrc: '87654321',
          ownerState: 'SC',
          ownerTaxId: '12345678901',
          ownerTaxRegime: '1',
          ownership: 'aggregate',
        },
      }),
    )

    expect(payload.veiculoTracao.proprietario).toEqual({
      cpf: '12345678901',
      nome: 'Jose Motorista',
      rntrc: '87654321',
      tipoProprietario: '1',
      uf: 'SC',
    })
  })

  test('refuses to build what the SEFAZ would reject', () => {
    expect(() => buildMdfePayload(params({ documents: [] }))).toThrow(
      MdfePayloadEmptySelectionError,
    )
    expect(() => buildMdfePayload(params({ loadingCities: [] }))).toThrow(
      MdfePayloadMissingLoadingCityError,
    )
    expect(() => buildMdfePayload(params({ drivers: [] }))).toThrow(MdfePayloadMissingDriverError)
    expect(() =>
      buildMdfePayload(params({ vehicle: { ...params().vehicle, wheelType: '' } })),
    ).toThrow(MdfePayloadMissingWheelTypeError)
    expect(() =>
      buildMdfePayload(params({ vehicle: { ...params().vehicle, ownership: 'third_party' } })),
    ).toThrow(MdfePayloadMissingOwnerError)
    expect(() =>
      buildMdfePayload(params({ manifest: { ...params().manifest, rntrc: '' } })),
    ).toThrow(MdfePayloadMissingRntrcError)
  })

  test('lets a carga própria manifest travel without RNTRC', () => {
    const payload = buildMdfePayload(
      params({ manifest: { ...params().manifest, emitterType: '2', rntrc: '' } }),
    )

    expect(payload.rntrc).toBeUndefined()
    expect(payload.tipoEmitente).toBe('2')
  })

  test('omits seguro, contratante, pagamento and lotação while nothing is configured', () => {
    const payload = buildMdfePayload(params())

    expect(payload.seguro).toBeUndefined()
    expect(payload.contratantes).toBeUndefined()
    expect(payload.pagamentos).toBeUndefined()
    expect(payload.produtoPredominante?.lotacao).toBeUndefined()
  })

  test('carries the insurance the SVRS demands from a prestador de serviço (rejeição 698)', () => {
    const payload = buildMdfePayload(
      params({
        companyDefaults: {
          ...params().companyDefaults,
          insurance: {
            insurerName: 'Seguradora Ada',
            insurerTaxId: '11222333000181',
            policy: '1234567890',
            responsibility: '1',
          },
        },
        manifest: { ...params().manifest, insuranceEndorsement: '12345678901234' },
      }),
    )

    expect(payload.seguro).toEqual({
      apolice: '1234567890',
      averbacoes: ['12345678901234'],
      responsavel: '1',
      responsavelCnpj: '61156864000191',
      seguradora: { cnpj: '11222333000181', nome: 'Seguradora Ada' },
    })
  })

  // SEFAZ 699: no modal rodoviário o seguro exige documento do responsável e averbação
  test('answers for the insurance with the contractor document when the contractor is responsible', () => {
    const payload = buildMdfePayload(
      params({
        companyDefaults: {
          ...params().companyDefaults,
          insurance: {
            insurerName: 'Seguradora Ada',
            insurerTaxId: '11222333000181',
            policy: '1234567890',
            responsibility: '2',
          },
        },
        manifest: {
          ...params().manifest,
          contractorTaxId: '52998224725',
          insuranceEndorsement: '12345678901234',
        },
      }),
    )

    expect(payload.seguro?.responsavelCpf).toBe('52998224725')
    expect(payload.seguro?.responsavelCnpj).toBeUndefined()
  })

  test('refuses an insured manifest with no endorsement', () => {
    expect(() =>
      buildMdfePayload(
        params({
          companyDefaults: {
            ...params().companyDefaults,
            insurance: {
              insurerName: 'Seguradora Ada',
              insurerTaxId: '11222333000181',
              policy: '1234567890',
              responsibility: '1',
            },
          },
        }),
      ),
    ).toThrow(MdfePayloadMissingInsuranceEndorsementError)
  })

  test('refuses to hand the insurance to a contractor with no tax id', () => {
    expect(() =>
      buildMdfePayload(
        params({
          companyDefaults: {
            ...params().companyDefaults,
            insurance: {
              insurerName: 'Seguradora Ada',
              insurerTaxId: '11222333000181',
              policy: '1234567890',
              responsibility: '2',
            },
          },
          manifest: { ...params().manifest, insuranceEndorsement: '12345678901234' },
        }),
      ),
    ).toThrow(MdfePayloadMissingInsuranceResponsibleError)
  })

  test('carries the contratante and the payment the SVRS demands (rejeições 578 e 302)', () => {
    const payload = buildMdfePayload(
      params({
        companyDefaults: {
          ...params().companyDefaults,
          bank: { bankBranch: '1234', bankCode: '341', pixKey: '' },
        },
        manifest: {
          ...params().manifest,
          contractorName: 'Industria Contratante',
          contractorTaxId: '11222333000181',
          freightValue: '1500.00',
        },
      }),
    )

    expect(payload.contratantes).toEqual([{ cnpj: '11222333000181' }])
    expect(payload.pagamentos).toEqual([
      {
        cnpj: '11222333000181',
        componentes: [{ descricao: 'FRETE', tipoComponente: '99', valor: 1500 }],
        dadosBancarios: { codigoAgencia: '1234', codigoBanco: '341' },
        indicadorPagamento: '0',
        nome: 'Industria Contratante',
        valorContrato: 1500,
      },
    ])
  })

  test('takes a CPF contratante and a PIX key over bank and branch', () => {
    const payload = buildMdfePayload(
      params({
        companyDefaults: {
          ...params().companyDefaults,
          bank: { bankBranch: '1234', bankCode: '341', pixKey: 'financeiro@transportadora.com.br' },
        },
        manifest: {
          ...params().manifest,
          contractorName: 'Jose da Silva',
          contractorTaxId: '12345678901',
          freightValue: '990.50',
        },
      }),
    )

    expect(payload.contratantes).toEqual([{ cpf: '12345678901' }])
    expect(payload.pagamentos?.[0]?.cpf).toBe('12345678901')
    expect(payload.pagamentos?.[0]?.dadosBancarios).toEqual({
      pix: 'financeiro@transportadora.com.br',
    })
    expect(payload.pagamentos?.[0]?.valorContrato).toBe(990.5)
  })

  test('carries the loading and discharge CEP a carga lotação requires (rejeição 726)', () => {
    const payload = buildMdfePayload(
      params({
        manifest: {
          ...params().manifest,
          dischargePostalCode: '20031170',
          loadingPostalCode: '01001000',
        },
      }),
    )

    expect(payload.produtoPredominante?.lotacao).toEqual({
      cepCarregamento: '01001000',
      cepDescarregamento: '20031170',
    })
  })
})
