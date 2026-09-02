/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const FORM_SOURCE = await Bun.file(
  new URL(
    '../../src/modules/application/components/PreRegistrationForm.component.tsx',
    import.meta.url,
  ),
).text()

/**
 * Esta app não tem DOM no teste: o que se prova é serviço puro e **texto de fonte**. A fiação abaixo
 * compila e passa em qualquer teste de caminho feliz mesmo quebrada — foi assim que a rota pública de
 * anexo ficou seis meses sem chamador nenhum, com backend inteiro pronto do outro lado.
 */
describe('a landing liga o anexo à rota pública', () => {
  test('o campo de arquivo envia além de ler', () => {
    expect(FORM_SOURCE).toContain('attachments.upload(')
    expect(FORM_SOURCE).toContain('documentIntake.read(file)')
  })

  test('o submit amarra os rascunhos que chegaram', () => {
    expect(FORM_SOURCE).toContain('attachmentDraftIds: attachments.draftIds')
  })

  /**
   * A leitura no navegador **fica** (ADR-0053, "O que não muda"): ela é o que preenche o formulário
   * na hora. Trocá-la pela do servidor custaria um round-trip antes do primeiro campo aparecer.
   */
  test('o preenchimento continua saindo da leitura local', () => {
    expect(FORM_SOURCE).toContain('mergeCcmeiIntoFields(')
    expect(FORM_SOURCE).toContain('useCompanyDocumentIntake(')
  })

  /** O texto prometia que nada era enviado antes do submit; com o upload ligado, isso virou mentira. */
  test('a ajuda do campo não promete mais que nada é enviado', () => {
    expect(FORM_SOURCE).not.toContain('nada dele é enviado')
  })

  /** Falha de anexo não pode bloquear o cadastro: o formulário é o que importa. */
  test('o envio da candidatura não depende de anexo ter dado certo', () => {
    expect(FORM_SOURCE).toContain(
      'attachments.draftIds.length === 0 ? {} : { attachmentDraftIds: attachments.draftIds }',
    )
  })
})
