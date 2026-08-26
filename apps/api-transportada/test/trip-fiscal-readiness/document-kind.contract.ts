/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { resolveFiscalDocumentKind } from '../../src/trips/domain/fiscal-document-kind.policy.js'

const RIBEIRAO_PRETO = '3543402'
const SERTAOZINHO = '3551702'
const SAO_PAULO = '3550308'

describe('qual documento a nota vai gerar', () => {
  /** Transporte dentro do município é serviço municipal: ISS, NFS-e. */
  it('entrega no município da transportadora vira NFS-e', () => {
    expect(
      resolveFiscalDocumentKind({
        companyCityCode: RIBEIRAO_PRETO,
        destinationCityCode: RIBEIRAO_PRETO,
        originCityCode: RIBEIRAO_PRETO,
      }),
    ).toBe('nfse')
  })

  it('entrega em outro município vira CT-e', () => {
    expect(
      resolveFiscalDocumentKind({
        companyCityCode: RIBEIRAO_PRETO,
        destinationCityCode: SERTAOZINHO,
        originCityCode: RIBEIRAO_PRETO,
      }),
    ).toBe('cte')
  })

  /**
   * ⚠️ Este teste **documenta a ressalva da spec 065 D3**, não a esconde. A regra fiscalmente
   * completa é o par origem→destino: coleta em São Paulo com entrega em Ribeirão é intermunicipal, e
   * o documento correto seria CT-e. A regra escolhida devolve NFS-e aqui.
   *
   * Está travado assim de propósito: no dia em que a regra do par entrar, é este teste que muda — e
   * quem o mudar lê, na linha de cima, por que ele existia.
   */
  it('coleta em outra cidade com entrega aqui devolve NFS-e — é a ressalva registrada', () => {
    expect(
      resolveFiscalDocumentKind({
        companyCityCode: RIBEIRAO_PRETO,
        destinationCityCode: RIBEIRAO_PRETO,
        originCityCode: SAO_PAULO,
      }),
    ).toBe('nfse')
  })

  /** Um palpite para CT-e emitiria documento errado em silêncio — o caro desta feature. */
  it('sem município de destino não decide, e não chuta', () => {
    expect(
      resolveFiscalDocumentKind({
        companyCityCode: RIBEIRAO_PRETO,
        destinationCityCode: null,
        originCityCode: RIBEIRAO_PRETO,
      }),
    ).toBeNull()
  })

  it('sem município da empresa não decide', () => {
    expect(
      resolveFiscalDocumentKind({
        companyCityCode: null,
        destinationCityCode: SERTAOZINHO,
        originCityCode: RIBEIRAO_PRETO,
      }),
    ).toBeNull()
  })

  /** IBGE tem sete dígitos; qualquer outra coisa é dado sujo, e dado sujo não decide. */
  it('código fora do formato do IBGE não decide', () => {
    for (const dirty of ['354340', '35434021', 'abc', '']) {
      expect(
        resolveFiscalDocumentKind({
          companyCityCode: RIBEIRAO_PRETO,
          destinationCityCode: dirty,
          originCityCode: RIBEIRAO_PRETO,
        }),
      ).toBeNull()
    }
  })

  /** A máscara chega de importação antiga; o código é o mesmo. */
  it('ignora pontuação no código', () => {
    expect(
      resolveFiscalDocumentKind({
        companyCityCode: '3543402',
        destinationCityCode: '3.543.402',
        originCityCode: null,
      }),
    ).toBe('nfse')
  })
})
