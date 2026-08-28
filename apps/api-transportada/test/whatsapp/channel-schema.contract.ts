/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { whatsappChannels } from '../../src/database/database.schema.js'
import { parseEnvironment } from '../../src/config/environment.schema.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'
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

describe('a configuração do canal (spec 062 T002)', () => {
  /**
   * ⚠️ **Nenhum segredo em variável de ambiente.** O token é por empresa e vive selado no banco: uma
   * variável global aqui daria um token para toda a instalação, e "um número por filial" viraria um
   * número para todas. O contrato falha se alguém acrescentar uma.
   */
  test('o ambiente não carrega token nem número', async () => {
    const schemaSource = await Bun.file('src/config/environment.schema.ts').text()

    expect(schemaSource).toContain('WHATSAPP_API_VERSION')
    expect(schemaSource).toContain('WHATSAPP_BASE_URL')
    expect(schemaSource).not.toContain('WHATSAPP_ACCESS_TOKEN')
    expect(schemaSource).not.toContain('WHATSAPP_PHONE_NUMBER_ID')
    expect(schemaSource).not.toContain('WHATSAPP_WABA_ID')
  })

  /**
   * Instalação sem WhatsApp não pode deixar de subir por causa disso: as duas são opcionais, e a
   * versão tem padrão. O que falha alto é canal cadastrado com envelope ilegível — e isso é T004.
   */
  test('sobe sem as variáveis, com a versão no padrão', () => {
    const parsed = parseEnvironment(API_ENVIRONMENT)

    expect(parsed.whatsapp.apiVersion).toBe('v23.0')
    expect(parsed.whatsapp.baseUrl).toBeUndefined()
  })

  /** Versão fora do formato da Meta é erro de digitação que só apareceria no primeiro envio. */
  test('recusa versão que não é versão da Graph API', () => {
    expect(() => parseEnvironment({ ...API_ENVIRONMENT, WHATSAPP_API_VERSION: '23' })).toThrow()
  })

  /** A base existe para o mock local; endereço que não é confiável é recusado no boot. */
  test('aceita localhost e https, e recusa o resto', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, WHATSAPP_BASE_URL: 'http://localhost:8080' }).whatsapp
        .baseUrl,
    ).toBe('http://localhost:8080')
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, WHATSAPP_BASE_URL: 'http://graph.facebook.com' }),
    ).toThrow()
  })
})
