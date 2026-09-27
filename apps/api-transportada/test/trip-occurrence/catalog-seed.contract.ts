/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_TYPE_CATALOG } from '../../src/shared/occurrence-type-catalog.constant.js'
import {
  seedOccurrenceTypeCatalog,
  type OccurrenceTypeCatalogSeedPort,
} from '../../src/database/occurrence-type-catalog-seed.service.js'

const COMPANY_A = '00000000-0000-4000-8000-000000000a01'
const COMPANY_B = '00000000-0000-4000-8000-000000000a02'

type StoredType = { readonly companyId: string; readonly name: string; readonly stage: string }

function createFakePort(companyIds: readonly string[], existing: readonly StoredType[] = []) {
  const inserted: StoredType[] = []
  const byCompany = new Map<string, StoredType[]>()
  for (const type of existing) {
    byCompany.set(type.companyId, [...(byCompany.get(type.companyId) ?? []), type])
  }

  const port: OccurrenceTypeCatalogSeedPort = {
    listCompanyIds: () => Promise.resolve(companyIds),
    hasAnyOccurrenceType: ({ companyId }) =>
      Promise.resolve((byCompany.get(companyId) ?? []).length > 0),
    insertOccurrenceTypes: ({ companyId, types }) => {
      for (const type of types) {
        const record = { companyId, name: type.name, stage: type.stage }
        inserted.push(record)
        byCompany.set(companyId, [...(byCompany.get(companyId) ?? []), record])
      }
      return Promise.resolve()
    },
  }

  return { inserted, port }
}

/**
 * Defeito medido em 21/09/2026: `company_occurrence_types` vazia em staging e produção — a
 * migration que criou a tabela nunca levou o catálogo legado para o banco.
 *
 * ⚠️ **Bootstrap, não sincronização** (revisão de 21/09/2026): a primeira versão comparava por
 * `(stage, name)` e ressuscitava tipo renomeado a cada deploy — renomear é operação suportada pela
 * tela de cadastro, e o nome novo nunca batia com o catálogo. Agora a regra é: empresa com
 * **qualquer** tipo cadastrado (ativo ou não) é intocável; só empresa com catálogo vazio recebe os
 * sete, uma vez só.
 */
describe('o seed do catálogo de tipos de ocorrência só semeia empresa vazia', () => {
  test('empresa sem tipo nenhum recebe os sete do catálogo', async () => {
    const { inserted, port } = createFakePort([COMPANY_A])

    const count = await seedOccurrenceTypeCatalog({ port })

    expect(count).toBe(OCCURRENCE_TYPE_CATALOG.length)
    expect(inserted).toHaveLength(OCCURRENCE_TYPE_CATALOG.length)
    expect(inserted.every((type) => type.companyId === COMPANY_A)).toBe(true)
  })

  test('segunda execução cria zero', async () => {
    const { port } = createFakePort([COMPANY_A])

    await seedOccurrenceTypeCatalog({ port })
    const second = await seedOccurrenceTypeCatalog({ port })

    expect(second).toBe(0)
  })

  /** O caso central desta revisão: um tipo só, e os outros seis nunca chegam. */
  test('empresa com um tipo qualquer não recebe os outros seis', async () => {
    const [firstEntry] = OCCURRENCE_TYPE_CATALOG
    if (firstEntry === undefined) throw new Error('catálogo vazio')

    const { inserted, port } = createFakePort(
      [COMPANY_A],
      [{ companyId: COMPANY_A, name: firstEntry.name, stage: firstEntry.stage }],
    )

    const count = await seedOccurrenceTypeCatalog({ port })

    expect(count).toBe(0)
    expect(inserted).toEqual([])
  })

  /** Renomear é decisão da transportadora — o seed nunca compete com o cadastro, nem depois de
   * rodar duas vezes. */
  test('empresa com tipo renomeado continua com o nome trocado depois de duas execuções', async () => {
    const [firstEntry] = OCCURRENCE_TYPE_CATALOG
    if (firstEntry === undefined) throw new Error('catálogo vazio')

    const { inserted, port } = createFakePort(
      [COMPANY_A],
      [{ companyId: COMPANY_A, name: 'Nome trocado pela transportadora', stage: firstEntry.stage }],
    )

    await seedOccurrenceTypeCatalog({ port })
    const second = await seedOccurrenceTypeCatalog({ port })

    expect(second).toBe(0)
    expect(inserted).toEqual([])
  })

  test('cada empresa recebe o catálogo, isoladamente', async () => {
    const { inserted, port } = createFakePort([COMPANY_A, COMPANY_B])

    const count = await seedOccurrenceTypeCatalog({ port })

    expect(count).toBe(OCCURRENCE_TYPE_CATALOG.length * 2)
    expect(inserted.filter((type) => type.companyId === COMPANY_A)).toHaveLength(
      OCCURRENCE_TYPE_CATALOG.length,
    )
    expect(inserted.filter((type) => type.companyId === COMPANY_B)).toHaveLength(
      OCCURRENCE_TYPE_CATALOG.length,
    )
  })

  test('sem empresa nenhuma, não cria nada', async () => {
    const { inserted, port } = createFakePort([])

    const count = await seedOccurrenceTypeCatalog({ port })

    expect(count).toBe(0)
    expect(inserted).toEqual([])
  })

  /**
   * Pedido do usuário (25/09/2026, spec 208): tipo de rua para o motorista registrar que o
   * cliente pediu a segunda via do boleto — sem foto, sem soltar a nota da viagem.
   */
  test('o catálogo inclui "Cliente pediu segunda via do boleto" na etapa de entrega', () => {
    const entry = OCCURRENCE_TYPE_CATALOG.find(
      (type) => type.name === 'Cliente pediu segunda via do boleto',
    )

    expect(entry).toBeDefined()
    expect(entry?.stage).toBe('delivery')
  })
})
