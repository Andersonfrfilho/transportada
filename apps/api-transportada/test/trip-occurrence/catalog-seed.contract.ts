/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BILL_EXTENSION_OCCURRENCE_TYPE_NAME,
  OCCURRENCE_TYPE_CATALOG,
  SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME,
} from '../../src/shared/occurrence-type-catalog.constant.js'
import {
  seedOccurrenceTypeCatalog,
  seedReceivingOccurrenceTypeCatalog,
  type OccurrenceTypeCatalogSeedPort,
} from '../../src/database/occurrence-type-catalog-seed.service.js'

const COMPANY_A = '00000000-0000-4000-8000-000000000a01'
const COMPANY_B = '00000000-0000-4000-8000-000000000a02'

type StoredType = {
  readonly companyId: string
  readonly itemsMode?: string
  readonly name: string
  readonly redeliveryPolicy?: string
  readonly stage: string
}

function createFakePort(companyIds: readonly string[], existing: readonly StoredType[] = []) {
  const inserted: StoredType[] = []
  const byCompany = new Map<string, StoredType[]>()
  for (const type of existing) {
    byCompany.set(type.companyId, [...(byCompany.get(type.companyId) ?? []), type])
  }

  const port: OccurrenceTypeCatalogSeedPort = {
    listCompanyIds: () => Promise.resolve(companyIds),
    hasAnyOccurrenceType: ({ companyId, stages }) =>
      Promise.resolve(
        (byCompany.get(companyId) ?? []).some((type) =>
          stages.some((stage) => stage === type.stage),
        ),
      ),
    insertOccurrenceTypes: ({ companyId, types }) => {
      for (const type of types) {
        const record = {
          companyId,
          itemsMode: type.itemsMode,
          name: type.name,
          ...(type.redeliveryPolicy === undefined
            ? {}
            : { redeliveryPolicy: type.redeliveryPolicy }),
          stage: type.stage,
        }
        inserted.push(record)
        byCompany.set(companyId, [...(byCompany.get(companyId) ?? []), record])
      }
      return Promise.resolve(types.length)
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

  /** Spec 241 CA02: o seed grava `itemsMode` explícito, e só os dois tipos de boleto saem sem itens. */
  test('os tipos de boleto saem com itens desligados e os demais com itens opcionais', async () => {
    const { inserted, port } = createFakePort([COMPANY_A])

    await seedOccurrenceTypeCatalog({ port })

    const billTypeNames = [
      SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME,
      BILL_EXTENSION_OCCURRENCE_TYPE_NAME,
    ]
    const offTypes = inserted.filter((type) => type.itemsMode === 'off')
    const optionalTypes = inserted.filter((type) => type.itemsMode === 'optional')

    expect(offTypes.map((type) => type.name).sort()).toEqual([...billTypeNames].sort())
    expect(optionalTypes).toHaveLength(OCCURRENCE_TYPE_CATALOG.length - billTypeNames.length)
    expect(inserted).toHaveLength(offTypes.length + optionalTypes.length)
  })

  /** Spec 241 D2: a prorrogação é entrada de bootstrap, na rua, com os defaults da 208. */
  test('o catálogo inclui "Cliente pediu prorrogação do boleto" na etapa de entrega', () => {
    const entry = OCCURRENCE_TYPE_CATALOG.find(
      (type) => type.name === BILL_EXTENSION_OCCURRENCE_TYPE_NAME,
    )

    expect(BILL_EXTENSION_OCCURRENCE_TYPE_NAME).toBe('Cliente pediu prorrogação do boleto')
    expect(entry?.stage).toBe('delivery')
    expect(entry?.itemsMode).toBe('off')
  })
})

/**
 * Spec 237 T3.2 (ADR-0094 §9.2): o catálogo de RECEBIMENTO é bootstrap por etapa — empresa sem
 * nenhum tipo `receiving` (ativo ou aposentado) recebe os três, uma vez; quem já tem um fica intocada.
 * Os três abrem a tratativa (`blocked`, a P2: "aparece na tratativa") e aceitam itens (ajuste 3).
 */
describe('o seed do catálogo de recebimento (spec 237 T3.2)', () => {
  test('empresa já com catálogo de viagem recebe os três de recebimento', async () => {
    const [firstEntry] = OCCURRENCE_TYPE_CATALOG
    if (firstEntry === undefined) throw new Error('catálogo vazio')
    const { inserted, port } = createFakePort(
      [COMPANY_A],
      [{ companyId: COMPANY_A, name: firstEntry.name, stage: firstEntry.stage }],
    )

    expect(await seedReceivingOccurrenceTypeCatalog({ port })).toBe(3)
    expect(inserted).toEqual([
      {
        companyId: COMPANY_A,
        itemsMode: 'optional',
        name: 'Item avariado na chegada',
        redeliveryPolicy: 'blocked',
        stage: 'receiving',
      },
      {
        companyId: COMPANY_A,
        itemsMode: 'optional',
        name: 'Divergência de quantidade na chegada',
        redeliveryPolicy: 'blocked',
        stage: 'receiving',
      },
      {
        companyId: COMPANY_A,
        itemsMode: 'optional',
        name: 'Item faltante na chegada',
        redeliveryPolicy: 'blocked',
        stage: 'receiving',
      },
    ])
  })

  test('empresa com um tipo de recebimento (renomeado ou aposentado) fica intocada', async () => {
    const { inserted, port } = createFakePort(
      [COMPANY_A],
      [{ companyId: COMPANY_A, name: 'Avaria na doca', stage: 'receiving' }],
    )

    expect(await seedReceivingOccurrenceTypeCatalog({ port })).toBe(0)
    expect(inserted).toEqual([])
  })

  test('o tipo de recebimento não conta como catálogo de viagem (a ordem do pre-deploy não importa)', async () => {
    const { inserted, port } = createFakePort(
      [COMPANY_A],
      [{ companyId: COMPANY_A, name: 'Item avariado', stage: 'receiving' }],
    )

    expect(await seedOccurrenceTypeCatalog({ port })).toBe(OCCURRENCE_TYPE_CATALOG.length)
    expect(inserted.every((type) => type.stage !== 'receiving')).toBe(true)
  })
})

/**
 * Spec 237 T3.4a: o nome do tipo é único por empresa em qualquer etapa, e a gravação pula o nome já
 * usado. Se TODOS os três forem pulados, a empresa fica sem tipo de recebimento e ninguém fica sabendo.
 */
describe('o aviso quando a semente de recebimento não grava nada (spec 237 T3.4a)', () => {
  function createWarnings() {
    const warnings: (readonly [string, Record<string, unknown> | undefined])[] = []
    return {
      logger: {
        warn: (message: string, metadata?: Record<string, unknown>) =>
          void warnings.push([message, metadata]),
      },
      warnings,
    }
  }

  test('nada gravado e nenhum tipo de recebimento: avisa, com a empresa como id opaco', async () => {
    const { port } = createFakePort([COMPANY_A])
    const { logger, warnings } = createWarnings()

    expect(
      await seedReceivingOccurrenceTypeCatalog({
        logger,
        port: { ...port, insertOccurrenceTypes: () => Promise.resolve(0) },
      }),
    ).toBe(0)
    expect(warnings).toEqual([
      ['occurrence_type_seed.receiving_none_created', { companyId: COMPANY_A }],
    ])
  })

  test('gravou ao menos um, ou a empresa já tem tipo de recebimento: sem aviso', async () => {
    const { port } = createFakePort(
      [COMPANY_A, COMPANY_B],
      [{ companyId: COMPANY_B, name: 'Avaria na doca', stage: 'receiving' }],
    )
    const { logger, warnings } = createWarnings()

    expect(await seedReceivingOccurrenceTypeCatalog({ logger, port })).toBe(3)
    expect(warnings).toEqual([])
  })
})
