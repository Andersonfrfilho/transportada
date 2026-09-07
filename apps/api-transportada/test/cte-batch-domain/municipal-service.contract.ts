/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  CTE_BATCH_BLOCK_REASON,
  checkDocumentEligibility,
} from '../../src/cte-batches/domain/cte-batch-eligibility.policy.js'
import {
  resolveServiceScope,
  SERVICE_SCOPE,
} from '../../src/cte-batches/domain/municipal-service.policy.js'

const RIBEIRAO = '3543402'
const LUIS_ANTONIO = '3527108'

describe('competência do serviço: municipal ou intermunicipal', () => {
  it('mesmo município é serviço municipal', () => {
    expect(resolveServiceScope({ recipientCityCode: RIBEIRAO, senderCityCode: RIBEIRAO })).toBe(
      SERVICE_SCOPE.municipal,
    )
  })

  it('municípios distintos não são serviço municipal', () => {
    expect(resolveServiceScope({ recipientCityCode: LUIS_ANTONIO, senderCityCode: RIBEIRAO })).toBe(
      SERVICE_SCOPE.interMunicipal,
    )
  })

  /**
   * ⚠️ Código ausente **não decide**. Chutar trocaria uma emissão possivelmente errada por uma
   * emissão impossível, e nota antiga sem o código completo existe na base.
   */
  it('código ausente de qualquer lado é indefinido, nunca um palpite', () => {
    expect(resolveServiceScope({ recipientCityCode: null, senderCityCode: RIBEIRAO })).toBe(
      SERVICE_SCOPE.unknown,
    )
    expect(resolveServiceScope({ recipientCityCode: RIBEIRAO, senderCityCode: null })).toBe(
      SERVICE_SCOPE.unknown,
    )
    expect(resolveServiceScope({ recipientCityCode: '   ', senderCityCode: RIBEIRAO })).toBe(
      SERVICE_SCOPE.unknown,
    )
  })
})

const RIBEIRAO_TO_RIBEIRAO = {
  grossWeight: '108.6700',
  recipientCity: 'Ribeirão Preto',
  recipientCityCode: RIBEIRAO,
  recipientState: 'SP',
  recipientTaxId: '07531737000180',
  senderCity: 'Ribeirão Preto',
  senderCityCode: RIBEIRAO,
  senderState: 'SP',
  senderTaxId: '05868574001090',
  status: 'authorized',
  totalAmount: '916.8000',
  variant: 'complete',
} as const

/**
 * ⚠️ **O portão é escolha do perfil, não premissa do produto.** Medido em produção: das notas de
 * mesmo município, 0 de 920 tinham CT-e — o portão ligado por padrão não barraria nada —, e as 62
 * NFS-e emitidas eram todas intermunicipais, então a regra "municipal é NFS-e" não descreve o que
 * esta operação faz. Quem sabe se ela vale é quem configura o perfil, e por isso o padrão é
 * `allow`: a instalação que não escolheu nada continua decidindo pelos dois botões da tela.
 */
describe('o portão de serviço municipal é do perfil de emissão', () => {
  it('com o perfil em allow, nota do mesmo município passa', () => {
    const eligibility = checkDocumentEligibility({
      ...RIBEIRAO_TO_RIBEIRAO,
      municipalServicePolicy: 'allow',
    })

    expect(eligibility.reason).toBeUndefined()
  })

  it('com o perfil em block, nota do mesmo município é barrada', () => {
    const eligibility = checkDocumentEligibility({
      ...RIBEIRAO_TO_RIBEIRAO,
      municipalServicePolicy: 'block',
    })

    expect(eligibility.reason).toBe(CTE_BATCH_BLOCK_REASON.municipalService)
  })

  it('com o perfil em block, nota intermunicipal continua passando', () => {
    const eligibility = checkDocumentEligibility({
      ...RIBEIRAO_TO_RIBEIRAO,
      municipalServicePolicy: 'block',
      recipientCityCode: LUIS_ANTONIO,
    })

    expect(eligibility.reason).toBeUndefined()
  })

  /** Competência indefinida não barra nem com o portão ligado: chutar é pior que não decidir. */
  it('com o perfil em block, município ausente não barra', () => {
    const eligibility = checkDocumentEligibility({
      ...RIBEIRAO_TO_RIBEIRAO,
      municipalServicePolicy: 'block',
      recipientCityCode: null,
    })

    expect(eligibility.reason).toBeUndefined()
  })
})
