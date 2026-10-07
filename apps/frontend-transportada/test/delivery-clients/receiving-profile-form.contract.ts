/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 237 T1.4 (RF1, ADR-0094 §2 e §5): a ficha do perfil de recebimento. O `PUT` exige TODAS as
 * chaves, com `null` onde não há regra; as faixas são as do servidor; campo vazio nunca vira zero;
 * e nenhum nome de coluna ou preset de contratante mora no código.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  createReceivingProfileDraft,
  toReceivingProfileRules,
  type ReceivingProfileDraft,
} from '../../src/modules/delivery-clients/shared/receivingProfileDraft.service'
import { validateReceivingProfileDraft } from '../../src/modules/delivery-clients/shared/receivingProfile.validation'
import {
  PREVIEW_ITEM_FIELDS,
  RECEIVING_PROFILE_RULE_KEYS,
  type ReceivingProfile,
} from '../../src/modules/delivery-clients/shared/receivingProfile.types'

const SAVED_PROFILE: ReceivingProfile = {
  arrivalReferenceLabel: 'NroCarga:',
  contractorId: '00000000-0000-4000-8000-000000237001',
  deliveryDeadlineBusinessDays: 3,
  isEnabled: true,
  matchWindowDays: 20,
  previewColumnMap: { routeName: 'Coluna Roteiro', value: 'Coluna Valor', weightKg: 'Coluna Peso' },
  previewEnabled: true,
  previewSheetName: 'Aba Sintética',
  requiresDamageCheck: true,
  separationWindowHours: 24,
  updatedAt: '2026-10-03T12:00:00.000Z',
  weightTolerancePercent: 2.5,
}

function draftWith(overrides: Partial<ReceivingProfileDraft>): ReceivingProfileDraft {
  return { ...createReceivingProfileDraft(null), ...overrides }
}

function columnMapWith(
  entries: Partial<Record<(typeof PREVIEW_ITEM_FIELDS)[number], string>>,
): ReceivingProfileDraft['previewColumnMap'] {
  return { ...createReceivingProfileDraft(null).previewColumnMap, ...entries }
}

describe('o rascunho nasce do perfil, ou dos padrões quando ele não existe', () => {
  test('contratante sem perfil: desligado, janela de vínculo de 15 dias e tolerância zero', () => {
    const draft = createReceivingProfileDraft(null)

    expect(draft.isEnabled).toBe(false)
    expect(draft.previewEnabled).toBe(false)
    expect(draft.requiresDamageCheck).toBe(false)
    expect(draft.matchWindowDays).toBe('15')
    expect(draft.weightTolerancePercent).toBe('0')
    expect(draft.separationWindowHours).toBe('')
    expect(draft.deliveryDeadlineBusinessDays).toBe('')
    expect(draft.previewSheetName).toBe('')
    expect(draft.arrivalReferenceLabel).toBe('')
  })

  test('o mapa de colunas tem os 13 campos fixos, todos vazios', () => {
    const { previewColumnMap } = createReceivingProfileDraft(null)

    expect(Object.keys(previewColumnMap).sort()).toEqual([...PREVIEW_ITEM_FIELDS].sort())
    expect(Object.values(previewColumnMap).every((value) => value === '')).toBe(true)
  })

  test('perfil existente reabre com os valores gravados, a tolerância com vírgula', () => {
    const draft = createReceivingProfileDraft(SAVED_PROFILE)

    expect(draft.separationWindowHours).toBe('24')
    expect(draft.deliveryDeadlineBusinessDays).toBe('3')
    expect(draft.matchWindowDays).toBe('20')
    expect(draft.weightTolerancePercent).toBe('2,5')
    expect(draft.previewSheetName).toBe('Aba Sintética')
    expect(draft.arrivalReferenceLabel).toBe('NroCarga:')
    expect(draft.previewColumnMap.routeName).toBe('Coluna Roteiro')
    expect(draft.previewColumnMap.city).toBe('')
  })
})

describe('o PUT leva todas as chaves, com null onde não há regra (ADR-0094 §5)', () => {
  test('perfil novo sem nenhuma regra: as 10 chaves, regra ausente é null, nunca zero', () => {
    const rules = toReceivingProfileRules(createReceivingProfileDraft(null))

    expect(Object.keys(rules).sort()).toEqual([...RECEIVING_PROFILE_RULE_KEYS].sort())
    expect(rules).toEqual({
      arrivalReferenceLabel: null,
      deliveryDeadlineBusinessDays: null,
      isEnabled: false,
      matchWindowDays: 15,
      previewColumnMap: null,
      previewEnabled: false,
      previewSheetName: null,
      requiresDamageCheck: false,
      separationWindowHours: null,
      weightTolerancePercent: 0,
    })
  })

  test('ida e volta do perfil gravado não muda nada', () => {
    const { contractorId, updatedAt, ...rules } = SAVED_PROFILE
    void contractorId
    void updatedAt

    expect(toReceivingProfileRules(createReceivingProfileDraft(SAVED_PROFILE))).toEqual(rules)
  })

  test('texto só com espaços é null, e as pontas são aparadas', () => {
    const rules = toReceivingProfileRules(
      draftWith({
        arrivalReferenceLabel: '   ',
        previewSheetName: '  Minha aba  ',
        separationWindowHours: ' 48 ',
      }),
    )

    expect(rules.arrivalReferenceLabel).toBeNull()
    expect(rules.previewSheetName).toBe('Minha aba')
    expect(rules.separationWindowHours).toBe(48)
  })

  test('o mapa só leva as colunas preenchidas; sem nenhuma, é null', () => {
    const rules = toReceivingProfileRules(
      draftWith({
        previewColumnMap: columnMapWith({ city: ' Cidade ', routeName: 'Roteiro', state: '  ' }),
        previewEnabled: true,
      }),
    )

    expect(rules.previewColumnMap).toEqual({ city: 'Cidade', routeName: 'Roteiro' })
    expect(toReceivingProfileRules(draftWith({})).previewColumnMap).toBeNull()
  })

  test('com a prévia desligada o mapa preenchido segue gravado (é dado, não regra ligada)', () => {
    const rules = toReceivingProfileRules(
      draftWith({ previewColumnMap: columnMapWith({ value: 'V' }), previewEnabled: false }),
    )

    expect(rules.previewEnabled).toBe(false)
    expect(rules.previewColumnMap).toEqual({ value: 'V' })
  })

  test('a tolerância aceita vírgula ou ponto', () => {
    expect(
      toReceivingProfileRules(draftWith({ weightTolerancePercent: '1,25' })).weightTolerancePercent,
    ).toBe(1.25)
    expect(
      toReceivingProfileRules(draftWith({ weightTolerancePercent: '1.25' })).weightTolerancePercent,
    ).toBe(1.25)
  })
})

describe('as faixas são as do servidor', () => {
  test('rascunho padrão e perfil gravado não têm recusa', () => {
    expect(validateReceivingProfileDraft(createReceivingProfileDraft(null))).toEqual({})
    expect(validateReceivingProfileDraft(createReceivingProfileDraft(SAVED_PROFILE))).toEqual({})
  })

  test('janela de separação: 1 a 168, inteiro, vazio é permitido', () => {
    const issueFor = (separationWindowHours: string) =>
      validateReceivingProfileDraft(draftWith({ separationWindowHours })).separationWindowHours

    expect(issueFor('')).toBeUndefined()
    expect(issueFor('1')).toBeUndefined()
    expect(issueFor('168')).toBeUndefined()
    expect(issueFor('0')).toEqual({ code: 'outOfRange', max: 168, min: 1 })
    expect(issueFor('169')).toEqual({ code: 'outOfRange', max: 168, min: 1 })
    expect(issueFor('2,5')).toEqual({ code: 'notAnInteger' })
    expect(issueFor('abc')).toEqual({ code: 'notAnInteger' })
  })

  test('prazo de entrega em dias úteis: 1 a 60', () => {
    const issueFor = (deliveryDeadlineBusinessDays: string) =>
      validateReceivingProfileDraft(draftWith({ deliveryDeadlineBusinessDays }))
        .deliveryDeadlineBusinessDays

    expect(issueFor('60')).toBeUndefined()
    expect(issueFor('61')).toEqual({ code: 'outOfRange', max: 60, min: 1 })
    expect(issueFor('0')).toEqual({ code: 'outOfRange', max: 60, min: 1 })
  })

  test('janela de vínculo: obrigatória, 1 a 60', () => {
    const issueFor = (matchWindowDays: string) =>
      validateReceivingProfileDraft(draftWith({ matchWindowDays })).matchWindowDays

    expect(issueFor('')).toEqual({ code: 'required' })
    expect(issueFor('0')).toEqual({ code: 'outOfRange', max: 60, min: 1 })
    expect(issueFor('61')).toEqual({ code: 'outOfRange', max: 60, min: 1 })
    expect(issueFor('60')).toBeUndefined()
  })

  test('tolerância do peso: obrigatória, 0 a 100, no máximo duas casas', () => {
    const issueFor = (weightTolerancePercent: string) =>
      validateReceivingProfileDraft(draftWith({ weightTolerancePercent })).weightTolerancePercent

    expect(issueFor('')).toEqual({ code: 'required' })
    expect(issueFor('0')).toBeUndefined()
    expect(issueFor('100')).toBeUndefined()
    expect(issueFor('100,5')).toEqual({ code: 'outOfRange', max: 100, min: 0 })
    expect(issueFor('1,234')).toEqual({ code: 'tooManyDecimals' })
    expect(issueFor('x')).toEqual({ code: 'notANumber' })
    expect(issueFor('-1')).toEqual({ code: 'notANumber' })
  })

  test('aba até 31 caracteres, texto da carga até 60 e coluna até 80', () => {
    const issues = validateReceivingProfileDraft(
      draftWith({
        arrivalReferenceLabel: 'x'.repeat(61),
        previewColumnMap: columnMapWith({ city: 'c'.repeat(81) }),
        previewSheetName: 's'.repeat(32),
      }),
    )

    expect(issues.previewSheetName).toEqual({ code: 'tooLong', max: 31 })
    expect(issues.arrivalReferenceLabel).toEqual({ code: 'tooLong', max: 60 })
    expect(issues['previewColumnMap.city']).toEqual({ code: 'tooLong', max: 80 })
    expect(
      validateReceivingProfileDraft(
        draftWith({ previewSheetName: 's'.repeat(31), arrivalReferenceLabel: 'x'.repeat(60) }),
      ),
    ).toEqual({})
  })

  /** Revisão de segurança S3: o texto é literal e de uma linha, o mesmo que o servidor aceita. */
  test.each(['Nro\nCarga:', 'Nro\tCarga:', 'Nro\u0000Carga:'])(
    'texto da carga com caractere de controle (%p) é recusado no campo',
    (label) => {
      expect(validateReceivingProfileDraft(draftWith({ arrivalReferenceLabel: label }))).toEqual({
        arrivalReferenceLabel: { code: 'controlCharacter' },
      })
    },
  )
})

describe('o mapa de colunas', () => {
  const REQUIRED = { routeName: 'Roteiro', value: 'Valor', weightKg: 'Peso' } as const

  test('com a prévia ligada exige roteiro, valor e peso — cada coluna faltante é um campo', () => {
    const issues = validateReceivingProfileDraft(
      draftWith({
        previewColumnMap: columnMapWith({ routeName: 'Roteiro' }),
        previewEnabled: true,
      }),
    )

    expect(Object.keys(issues).sort()).toEqual([
      'previewColumnMap.value',
      'previewColumnMap.weightKg',
    ])
    expect(issues['previewColumnMap.value']).toEqual({ code: 'requiredForPreview' })
  })

  test('com a prévia desligada o mapa pode ficar vazio', () => {
    expect(
      validateReceivingProfileDraft(
        draftWith({ previewColumnMap: columnMapWith({}), previewEnabled: false }),
      ),
    ).toEqual({})
  })

  test('a mesma coluna em dois campos é recusada, ignorando caixa e espaços das pontas', () => {
    const issues = validateReceivingProfileDraft(
      draftWith({
        previewColumnMap: columnMapWith({ ...REQUIRED, city: ' valor ' }),
        previewEnabled: true,
      }),
    )

    expect(Object.keys(issues)).toEqual(['previewColumnMap.city'])
    expect(issues['previewColumnMap.city']).toEqual({ code: 'duplicateColumn' })
  })

  test('mapa completo e distinto passa', () => {
    expect(
      validateReceivingProfileDraft(
        draftWith({ previewColumnMap: columnMapWith(REQUIRED), previewEnabled: true }),
      ),
    ).toEqual({})
  })
})

describe('nenhum contratante mora no código (ADR-0021)', () => {
  const SOURCES = [
    'receivingProfile.types.ts',
    'receivingProfileDraft.service.ts',
    'receivingProfile.validation.ts',
  ].map((file) =>
    readFileSync(
      new URL(`../../src/modules/delivery-clients/shared/${file}`, import.meta.url),
      'utf8',
    ),
  )

  test('sem nome de coluna de planilha real, sem aba real e sem CNPJ', () => {
    for (const source of SOURCES) {
      expect(source).not.toMatch(/IMPORTA[ÇC][ÃA]O|PESO TOTAL|RouteName|Text001|NroCarga/u)
      expect(source).not.toMatch(/\b\d{14}\b/u)
    }
  })
})
