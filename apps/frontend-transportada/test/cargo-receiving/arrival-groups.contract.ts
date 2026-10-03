/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): o que a tela do celular decide sobre os grupos rota × cidade — qual abre sozinho
 * (o primeiro com pendência), a busca por número da nota, o nome da cidade que a API devolve (nunca uma
 * tabela de municípios no painel) e a leitura da chave de acesso pela câmera.
 */
import { describe, expect, test } from 'bun:test'

import {
  filterGroupsByNumber,
  findDocumentByScannedText,
  resolveGroupCityLabel,
  resolveGroupKey,
  resolveOpenGroupKeys,
} from '@/modules/cargo-receiving/shared/cargoArrivalGroups.service'

import { buildDetail, buildDocument, buildGroups } from '../fixtures/cargoReceiving.fixture'

const DETAIL = buildDetail()
const GROUPS = DETAIL.groups

describe('os grupos do celular (spec 237 T2.4)', () => {
  test('a chave do grupo é rota × cidade, e dois grupos nunca colidem', () => {
    const keys = GROUPS.map(resolveGroupKey)

    expect(new Set(keys).size).toBe(keys.length)
  })

  test('o nome da cidade é o que a API devolve; sem nome, o código; sem nada, nada', () => {
    expect(resolveGroupCityLabel(GROUPS[0] as (typeof GROUPS)[number])).toBe('Piracicaba')
    const [onlyCode] = buildGroups([buildDocument({ cityName: null, number: '1' })])
    expect(resolveGroupCityLabel(onlyCode as NonNullable<typeof onlyCode>)).toBe('3538709')
    expect(resolveGroupCityLabel(GROUPS.at(-1) as (typeof GROUPS)[number])).toBeNull()
  })

  test('abre sozinho o primeiro grupo com pendência', () => {
    const open = resolveOpenGroupKeys({ groups: GROUPS, toggled: {} })

    expect([...open]).toEqual([resolveGroupKey(GROUPS[0] as (typeof GROUPS)[number])])
  })

  test('com o primeiro grupo todo separado, abre o seguinte que ainda tem pendência', () => {
    const groups = buildGroups([
      buildDocument({ number: '1', separationState: 'separated' }),
      buildDocument({ cityIbgeCode: '3526902', cityName: 'Limeira', number: '2' }),
    ])

    expect([...resolveOpenGroupKeys({ groups, toggled: {} })]).toEqual([
      resolveGroupKey(groups[1] as NonNullable<(typeof groups)[number]>),
    ])
  })

  test('o toque do separador vence o padrão, nos dois sentidos', () => {
    const first = resolveGroupKey(GROUPS[0] as (typeof GROUPS)[number])
    const second = resolveGroupKey(GROUPS[1] as (typeof GROUPS)[number])

    const open = resolveOpenGroupKeys({
      groups: GROUPS,
      toggled: { [first]: false, [second]: true },
    })

    expect([...open]).toEqual([second])
  })

  test('tudo separado não abre nada sozinho', () => {
    const groups = buildGroups([buildDocument({ number: '1', separationState: 'separated' })])

    expect(resolveOpenGroupKeys({ groups, toggled: {} }).size).toBe(0)
  })
})

describe('a busca por número da nota', () => {
  test('sem busca devolve tudo; com busca, só as notas que casam, e some o grupo vazio', () => {
    expect(filterGroupsByNumber({ groups: GROUPS, query: '' })).toBe(GROUPS)
    expect(filterGroupsByNumber({ groups: GROUPS, query: '  ' })).toBe(GROUPS)

    const found = filterGroupsByNumber({ groups: GROUPS, query: '1004' })

    expect(found).toHaveLength(1)
    expect(found[0]?.documents.map((document) => document.number)).toEqual(['1004'])
  })

  test('casa por parte do número e mantém as contagens do grupo inteiro', () => {
    const found = filterGroupsByNumber({ groups: GROUPS, query: '100' })

    expect(found).toHaveLength(GROUPS.length)
    expect(found[0]?.counts).toEqual(
      GROUPS[0]?.counts as NonNullable<(typeof GROUPS)[number]>['counts'],
    )
  })

  test('busca sem resposta devolve lista vazia', () => {
    expect(filterGroupsByNumber({ groups: GROUPS, query: '9999' })).toEqual([])
  })
})

describe('a leitura da chave de acesso pela câmera', () => {
  const target = buildDocument({ number: '555' })
  const groups = buildGroups([target, buildDocument({ number: '556' })])

  test('acha a nota da chegada pela chave de 44 caracteres lida', () => {
    expect(findDocumentByScannedText({ groups, scanned: target.accessKey })?.number).toBe('555')
  })

  test('aceita a chave dentro do link do QR Code e ignora espaço e caixa', () => {
    expect(
      findDocumentByScannedText({
        groups,
        scanned: ` https://exemplo.test/consulta?chNFe=${target.accessKey.toLowerCase()} `,
      })?.number,
    ).toBe('555')
  })

  test('texto que não é chave, ou chave de outra chegada, não acha nada', () => {
    expect(findDocumentByScannedText({ groups, scanned: 'rastreio-123' })).toBeUndefined()
    expect(findDocumentByScannedText({ groups, scanned: `3526${'9'.repeat(40)}` })).toBeUndefined()
  })
})
