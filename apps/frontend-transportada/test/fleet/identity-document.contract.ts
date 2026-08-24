/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import enLocale from '../../src/modules/fleet/locales/fleet.en.locale.json'
import ptBrLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import {
  IDENTITY_DOCUMENT_ISSUERS,
  IDENTITY_DOCUMENT_MAX_LENGTH,
} from '../../src/modules/fleet/shared/fleet.types'
import { createDriverDraft, toDriverBody } from '../../src/modules/fleet/shared/fleetForm.service'

/**
 * O bundle não carrega código da API: a lista é reescrita no módulo, e o que garante que as duas
 * dizem a mesma coisa é esta asserção — a mesma disciplina de `vehicle-type-catalog.contract.ts`.
 */
const CATALOG = [
  'SSP',
  'PC',
  'DETRAN',
  'SDS',
  'IFP',
  'IML',
  'DIC',
  'SJS',
  'SES',
  'PF',
  'MEX',
  'MAER',
  'MMA',
  'OAB',
  'CTPS',
  'RNE',
  'OUTROS',
] as const

describe('driver identity document contract', () => {
  test('matches the API catalog, in the same order', () => {
    expect(IDENTITY_DOCUMENT_ISSUERS).toEqual(CATALOG)
    expect(IDENTITY_DOCUMENT_MAX_LENGTH).toBe(20)
  })

  test('names every issuer in both locales', () => {
    for (const issuer of IDENTITY_DOCUMENT_ISSUERS) {
      expect(ptBrLocale.identityDocumentIssuerOption[issuer]).toBeString()
      expect(enLocale.identityDocumentIssuerOption[issuer]).toBeString()
    }
  })

  /** Órgão fora da lista fechada vira ausência: o CHECK do banco conhece o mesmo catálogo. */
  test('drops an issuer outside the catalog', () => {
    for (const issuer of ['', 'ssp', 'SSP/SP', 'CNH']) {
      const body = toDriverBody({ ...createDriverDraft(), identityDocumentIssuer: issuer })

      expect(body.identityDocumentIssuer).toBe('')
    }

    expect(
      toDriverBody({ ...createDriverDraft(), identityDocumentIssuer: 'DETRAN' })
        .identityDocumentIssuer,
    ).toBe('DETRAN')
  })

  /** O RG não tem formato nacional: ponto, traço e letra entram como o estado os imprime. */
  test('keeps the document number as the state prints it', () => {
    const body = toDriverBody({
      ...createDriverDraft(),
      identityDocument: '  MG-12.345.678  ',
    })

    expect(body.identityDocument).toBe('MG-12.345.678')
  })
})
