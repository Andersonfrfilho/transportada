/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  MINIMUM_FAMILY_PREFIX_TOKENS,
  resolveBoxFamily,
  resolvePackagingUnitCount,
} from '../../src/nfe-documents/domain/package-box-family.policy.js'

/**
 * Todas as descrições daqui saíram da base de produção (663 caixas, emitente 05868574001090).
 * A família é o que o conferente mede uma vez e replica; errar para mais grava medida errada, e
 * errar para menos só mantém a medição manual de hoje — por isso a regra é a conservadora.
 */
describe('a família de variação do mesmo produto (spec 155 D2)', () => {
  test('parte a descrição no último token com dígito: o prefixo é a caixa, o resto é o sabor', () => {
    expect(
      resolveBoxFamily({ commercialUnit: 'CX36', description: 'SAB FARNESE 180G ERVA DOCE HORTE' }),
    ).toEqual({
      familyKey: 'SAB FARNESE 180G|CX36',
      prefix: 'SAB FARNESE 180G',
      variantLabel: 'ERVA DOCE HORTE',
    })
  })

  test.each([
    ['AMAC CONC DOWNY 500ML BRISA SUAVE', 'AMAC CONC DOWNY 500ML', 'BRISA SUAVE'],
    ['REFR TANG 18G MANGA', 'REFR TANG 18G', 'MANGA'],
    ['CHOC LACTA 80G LAKA/DIAMANTE N', 'CHOC LACTA 80G', 'LAKA/DIAMANTE N'],
    ['ABS INTIMUS NOTURNO C/30 SUAVE C/ABAS', 'ABS INTIMUS NOTURNO C/30', 'SUAVE C/ABAS'],
    ['CAFE MELITTA 500G EXTRA FORTE TRA', 'CAFE MELITTA 500G', 'EXTRA FORTE TRA'],
  ])('separa %s', (description, prefix, variantLabel) => {
    const family = resolveBoxFamily({ commercialUnit: 'CX12', description })
    expect(family.prefix).toBe(prefix)
    expect(family.variantLabel).toBe(variantLabel)
  })

  /** O mesmo sabão em CX72 e FR12 são duas caixas físicas — medir uma não mede a outra. */
  test('a unidade comercial entra na chave: CX72 e FR12 do mesmo prefixo são famílias distintas', () => {
    const description = 'SAB FLOR YPE SV 85G B AMENDOAS'
    const carton = resolveBoxFamily({ commercialUnit: 'CX72', description })
    const tray = resolveBoxFamily({ commercialUnit: 'FR12', description })

    expect(carton.prefix).toBe(tray.prefix)
    expect(carton.familyKey).not.toBe(tray.familyKey)
  })

  test('irmãos de sabor da mesma unidade caem na mesma chave', () => {
    const keyOf = (description: string) =>
      resolveBoxFamily({ commercialUnit: 'CX12', description }).familyKey

    expect(keyOf('AMAC CONC DOWNY 500ML BRISA SUAVE')).toBe(
      keyOf('AMAC CONC DOWNY 500ML LIRIOS CAMPO'),
    )
  })
})

describe('o prefixo genérico não forma família (spec 155 D2, falso positivo medido)', () => {
  /**
   * `AZEITE 500ML` é categoria + volume, com a marca na cauda: agrupa garrafa PET com garrafa de
   * vidro, de marcas diferentes. É a única família de 122 com prefixo de dois tokens em produção,
   * e replicar peso entre vidro e plástico gravaria medida errada.
   */
  test('AZEITE 500ML PET e AZEITE 500ML VD não replicam entre si', () => {
    const plastic = resolveBoxFamily({
      commercialUnit: 'CX12',
      description: 'AZEITE 500ML PET EXT VIRG COCINERO',
    })
    const glass = resolveBoxFamily({
      commercialUnit: 'CX12',
      description: 'AZEITE 500ML VD TRAD ANDORINHA',
    })

    expect(plastic.prefix).toBe('AZEITE 500ML')
    expect(plastic.familyKey).toBeUndefined()
    expect(glass.familyKey).toBeUndefined()
  })

  test(`exige ao menos ${MINIMUM_FAMILY_PREFIX_TOKENS} tokens no prefixo para abrir família`, () => {
    expect(MINIMUM_FAMILY_PREFIX_TOKENS).toBe(3)
    expect(
      resolveBoxFamily({ commercialUnit: 'CX20', description: 'AZEITE 250 VD TRAD GALLO' })
        .familyKey,
    ).toBeUndefined()
    expect(
      resolveBoxFamily({ commercialUnit: 'CX20', description: 'CAFE MELITTA 500G VACUO TRADICION' })
        .familyKey,
    ).toBeDefined()
  })
})

describe('as bordas da descrição do XML (spec 155 D2)', () => {
  test('descrição sem dígito nenhum vira prefixo inteiro, sem rótulo e sem família', () => {
    const family = resolveBoxFamily({
      commercialUnit: 'CX60',
      description: 'ESPONJA WISH MULTI USO',
    })

    expect(family.prefix).toBe('ESPONJA WISH MULTI USO')
    expect(family.variantLabel).toBe('')
    expect(family.familyKey).toBeUndefined()
  })

  /**
   * Corte guloso: `46.2` é o último token com dígito, então sobra rótulo vazio e a caixa fica
   * sozinha. Preferimos isto a cortar no primeiro dígito, que juntaria o PACK 15 com o sachê solto.
   */
  test('ALCOOL FLOPS 1L 46.2 fica sem rótulo e sem família', () => {
    const family = resolveBoxFamily({ commercialUnit: 'CX12', description: 'ALCOOL FLOPS 1L 46.2' })

    expect(family.prefix).toBe('ALCOOL FLOPS 1L 46.2')
    expect(family.variantLabel).toBe('')
    expect(family.familyKey).toBeUndefined()
  })

  /**
   * Miss aceito e deliberado: o dígito dentro do nome da variação (`12 EM 1`) empurra o corte até o
   * fim, e essa caixa não entra na família dos outros cinco cremes SKALA 1KG. Custa uma medição
   * manual; cortar no primeiro dígito custaria uma medida errada.
   */
  test('CR TRAT SKALA 1KG 12 EM 1 não entra na família CR TRAT SKALA 1KG', () => {
    const orphan = resolveBoxFamily({
      commercialUnit: 'CX6',
      description: 'CR TRAT SKALA 1KG 12 EM 1',
    })
    const sibling = resolveBoxFamily({
      commercialUnit: 'CX6',
      description: 'CR TRAT SKALA 1KG MELANCIA',
    })

    expect(sibling.familyKey).toBe('CR TRAT SKALA 1KG|CX6')
    expect(orphan.familyKey).not.toBe(sibling.familyKey)
  })

  /** O pack de 15 sachês é outra caixa: o corte guloso o separa do sachê avulso de propósito. */
  test('REFR TANG 18G PACK 15 é família própria, separada de REFR TANG 18G', () => {
    const packed = resolveBoxFamily({
      commercialUnit: 'CX10',
      description: 'REFR TANG 18G PACK 15 LAR',
    })
    const loose = resolveBoxFamily({ commercialUnit: 'CX10', description: 'REFR TANG 18G MANGA' })

    expect(packed.prefix).toBe('REFR TANG 18G PACK 15')
    expect(packed.variantLabel).toBe('LAR')
    expect(packed.familyKey).not.toBe(loose.familyKey)
    expect(packed.familyKey).toBe(
      resolveBoxFamily({ commercialUnit: 'CX10', description: 'REFR TANG 18G PACK 15 UVA' })
        .familyKey,
    )
  })

  /** Produção não tem acento, minúscula nem espaço duplo hoje; a normalização é defesa, não remendo. */
  test('normaliza caixa e espaço antes de comparar', () => {
    expect(
      resolveBoxFamily({
        commercialUnit: 'cx12',
        description: '  amac  conc downy 500ml brisa suave ',
      }).familyKey,
    ).toBe(
      resolveBoxFamily({ commercialUnit: 'CX12', description: 'AMAC CONC DOWNY 500ML BRISA SUAVE' })
        .familyKey,
    )
  })

  test('descrição só numérica não abre família', () => {
    const family = resolveBoxFamily({ commercialUnit: 'CX12', description: '500' })

    expect(family.prefix).toBe('500')
    expect(family.variantLabel).toBe('')
    expect(family.familyKey).toBeUndefined()
  })

  test('dígito no primeiro token mantém o prefixo mínimo', () => {
    const family = resolveBoxFamily({ commercialUnit: 'CX12', description: '3M ESPONJA MULTI USO' })

    expect(family.prefix).toBe('3M')
    expect(family.variantLabel).toBe('ESPONJA MULTI USO')
    expect(family.familyKey).toBeUndefined()
  })

  test('descrição vazia não explode nem abre família', () => {
    expect(resolveBoxFamily({ commercialUnit: 'CX12', description: '   ' })).toEqual({
      familyKey: undefined,
      prefix: '',
      variantLabel: '',
    })
  })
})

describe('a contagem de unidades da embalagem (spec 155 D3/D8)', () => {
  test.each([
    ['CX36', 36],
    ['FR12', 12],
    ['DP17', 17],
    ['CX180', 180],
    ['CX6', 6],
  ])('lê %s como %i unidades', (commercialUnit, expected) => {
    expect(resolvePackagingUnitCount(commercialUnit)).toBe(expected)
  })

  test('unidade sem sufixo numérico não inventa contagem', () => {
    expect(resolvePackagingUnitCount('CX')).toBeUndefined()
    expect(resolvePackagingUnitCount('')).toBeUndefined()
  })
})
