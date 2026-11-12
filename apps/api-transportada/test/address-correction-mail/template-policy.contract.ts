/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (T6, RF6): a régua do modelo `correcao-endereco.padrao` do módulo de notificação e a leitura do estado
 * (`GET /address-correction-requests/mail-template`).
 */
import { describe, expect, test } from 'bun:test'

import { createReadAddressCorrectionMailTemplateUseCase } from '../../src/address-correction/application/read-address-correction-mail-template.use-case.js'
import { ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY } from '../../src/address-correction/domain/address-correction-mail-template.constant.js'
import {
  assessAddressCorrectionTemplate,
  blocksAddressCorrectionMailSend,
} from '../../src/address-correction/domain/address-correction-mail-template.policy.js'
import {
  planOccurrenceMailTemplatePublication,
  readAddressCorrectionMailTemplateFile,
} from '../../src/occurrence-conversation/application/occurrence-mail-templates-publish.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000c01'
const FILE = readAddressCorrectionMailTemplateFile()

describe('o arquivo do modelo da correção de endereço', () => {
  test('a chave é a do sistema e o arquivo passa na régua sem problema algum', () => {
    expect(FILE.key).toBe(ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY)
    expect(assessAddressCorrectionTemplate(FILE)).toEqual([])
  })

  test('a publicação o planeja como create e o reconhece como same quando já está lá', () => {
    const verdict = (active: { body: string; subject: null | string; version: number }) =>
      planOccurrenceMailTemplatePublication({
        active: new Map([[FILE.key, active]]),
        overwrite: [],
        templates: [FILE],
      }).entries[0]?.verdict
    expect(
      planOccurrenceMailTemplatePublication({
        active: new Map(),
        overwrite: [],
        templates: [FILE],
      }).entries[0]?.verdict,
    ).toBe('create')
    expect(verdict({ body: FILE.body, subject: FILE.subject, version: 1 })).toBe('same')
  })

  test('um arquivo inválido recusa a publicação com o código do problema', () => {
    const plan = planOccurrenceMailTemplatePublication({
      active: new Map(),
      overwrite: [],
      templates: [{ ...FILE, body: `${FILE.body}{{numeroNota}}` }],
    })
    expect(plan.entries).toEqual([])
    expect(plan.invalid[0]?.problems).toMatchObject([{ code: 'unknown_variables' }])
  })
})

describe('assessAddressCorrectionTemplate', () => {
  test('sem modelo: not_found, que bloqueia o envio', () => {
    const problems = assessAddressCorrectionTemplate(null)
    expect(problems).toEqual([{ code: 'not_found' }])
    expect(blocksAddressCorrectionMailSend(problems)).toBe(true)
  })

  test('variável fora da lista fechada é apontada, mas não bloqueia o envio', () => {
    const problems = assessAddressCorrectionTemplate({
      ...FILE,
      subject: 'Olá {{nomeDoCliente}}',
    })
    expect(problems).toEqual([{ code: 'unknown_variables', variables: ['nomeDoCliente'] }])
    expect(blocksAddressCorrectionMailSend(problems)).toBe(false)
  })

  test('marcador quebrado, como {{ nome }} com espaço dentro do nome, é apontado', () => {
    const problems = assessAddressCorrectionTemplate({
      ...FILE,
      subject: 'Olá {{ contratante x }}',
    })
    expect(problems.map((problem) => problem.code)).toContain('malformed_placeholder')
  })

  test('assunto vazio, HTML inseguro e corpo sem área de mensagem bloqueiam o envio', () => {
    for (const template of [
      { ...FILE, subject: '  ' },
      { ...FILE, body: FILE.body.replace('<h1', '<script>x</script><h1') },
      { ...FILE, body: '<p>sem área</p>' },
      { ...FILE, body: 'texto puro, sem moldura nem área de mensagem' },
    ]) {
      expect(blocksAddressCorrectionMailSend(assessAddressCorrectionTemplate(template))).toBe(true)
    }
  })

  test('{{blocosEnderecos}} dentro da área de mensagem é HTML inseguro: o operador não o escolhe', () => {
    const body = FILE.body.replace('<!-- /mensagem -->', '{{blocosEnderecos}}<!-- /mensagem -->')
    expect(
      assessAddressCorrectionTemplate({ ...FILE, body }).map((problem) => problem.code),
    ).toContain('unsafe_html')
  })
})

describe('createReadAddressCorrectionMailTemplateUseCase', () => {
  test('modelo utilizável: devolve a versão e a prévia com os dados de exemplo', async () => {
    const useCase = createReadAddressCorrectionMailTemplateUseCase({
      findTemplate: async (params) => {
        expect(params).toEqual({ companyId: COMPANY_ID })
        return { ...FILE, version: 5 }
      },
    })

    const state = await useCase.read({ companyId: COMPANY_ID })

    expect(state).toMatchObject({
      key: ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY,
      problems: [],
      usable: true,
      version: 5,
    })
    expect(state.preview?.subject).toBe('Correção de endereço de entrega — 2 clientes')
    expect(state.preview?.html).toContain('Mercado Bom Preço Ltda')
    expect(state.variables.map((variable) => variable.name)).toContain('blocosEnderecos')
  })

  test('sem modelo: não utilizável, sem prévia e sem versão', async () => {
    const useCase = createReadAddressCorrectionMailTemplateUseCase({
      findTemplate: async () => undefined,
    })

    expect(await useCase.read({ companyId: COMPANY_ID })).toMatchObject({
      preview: null,
      problems: [{ code: 'not_found' }],
      usable: false,
      version: null,
    })
  })
})
