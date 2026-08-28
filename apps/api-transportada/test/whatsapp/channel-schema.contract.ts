/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { whatsappChannels } from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  foreignKeys,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('a credencial do WhatsApp (spec 062 T001)', () => {
  /**
   * Um canal por empresa: dois números na mesma empresa fariam a notificação escolher, e escolher de
   * que número o cliente recebe é decisão de operação, não sorteio de `order by`.
   */
  test('é uma por empresa, e o número não se repete entre empresas', () => {
    const uniques = uniqueColumnsByName(whatsappChannels)

    expect(uniques.whatsapp_channels_company_id_unique).toEqual(['company_id'])
    expect(uniques.whatsapp_channels_phone_number_id_unique).toEqual(['phone_number_id'])
  })

  /** O tenant é a âncora, como em toda tabela do produto. */
  test('ancora na empresa', () => {
    expect(foreignKeys(whatsappChannels)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'whatsapp_channels_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /**
   * O token vai **selado**, e a coluna é `jsonb` porque é o envelope inteiro que se guarda — não o
   * segredo. Uma coluna `text` aqui convidaria alguém a gravar o token direto.
   */
  test('guarda o envelope, não o segredo', () => {
    const types = columnSqlTypes(whatsappChannels)

    expect(types.secret_envelope).toBe('jsonb')
    /** E não existe coluna de token em claro — o contrato falha se alguém acrescentar uma. */
    expect(Object.keys(types)).not.toContain('access_token')
    expect(Object.keys(types)).not.toContain('token')
  })

  /**
   * Os dois identificadores da Meta são numéricos, e o de exibição é E.164 sem o `+`. O CHECK existe
   * porque id trocado por número (ou o contrário) só apareceria no primeiro envio, com o cliente do
   * outro lado esperando.
   */
  test('confere o formato dos identificadores da Meta', () => {
    const checks = unqualifiedCheckSqlByName(whatsappChannels)

    expect(checks.whatsapp_channels_phone_number_id_check).toContain('^[0-9]{5,32}$')
    expect(checks.whatsapp_channels_waba_id_check).toContain('^[0-9]{5,32}$')
    expect(checks.whatsapp_channels_display_number_check).toContain('^[0-9]{10,15}$')
    /** Vazio é o padrão: o número de exibição é conveniência de tela, não requisito de envio. */
    expect(checks.whatsapp_channels_display_number_check).toContain("= ''")
  })
})
