/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DOCUMENT_FIELDS,
  PRE_REGISTRATION_BLOCKS,
  shouldShowCompanyBlock,
} from '../../src/modules/application/shared/preRegistration.service'

const FORM_SOURCE = await Bun.file(
  new URL(
    '../../src/modules/application/components/PreRegistrationForm.component.tsx',
    import.meta.url,
  ),
).text()

/** Os blocos são irmãos estáticos no JSX, então a ordem da fonte é a ordem da tela. */
function renderedBlockOrder(): readonly number[] {
  return [...FORM_SOURCE.matchAll(/PRE_REGISTRATION_BLOCKS\[(\d+)\]/gu)].map((matched) =>
    Number(matched[1]),
  )
}

describe('a etapa de documentos abre o formulário', () => {
  test('Documentos é o primeiro bloco, antes de Dados pessoais', () => {
    expect(PRE_REGISTRATION_BLOCKS[0]).toBe('Documentos')
    expect(PRE_REGISTRATION_BLOCKS[1]).toBe('Dados pessoais')
  })

  /**
   * O risco desta tela é alguém acrescentar um bloco acima de Documentos sem perceber — e o ponto
   * inteiro da spec é ter os dados **antes** de preencher.
   */
  test('a tela desenha os blocos na ordem declarada, sem pular nem repetir', () => {
    expect(renderedBlockOrder()).toEqual(PRE_REGISTRATION_BLOCKS.map((_block, index) => index))
  })

  test('nenhum bloco é desenhado com o texto solto em vez do registro', () => {
    for (const block of PRE_REGISTRATION_BLOCKS) {
      expect(FORM_SOURCE).not.toContain(`<legend className={styles.legend}>${block}</legend>`)
    }
  })
})

describe('um campo por tipo de documento, todos opcionais', () => {
  test('oferece CRLV, documento da empresa, CNH e comprovante de endereço', () => {
    expect(DOCUMENT_FIELDS.map((document) => document.type)).toEqual([
      'crlv',
      'company_document',
      'cnh',
      'address_proof',
    ])
  })

  test('todo campo é anunciado como opcional na tela', () => {
    expect(FORM_SOURCE).toContain('${document.label} (opcional)')
  })

  /**
   * O campo da empresa é **um só** e aceita o que a pessoa tiver: quem não é MEI não pode ficar sem
   * campo. Só o CCMEI preenche, e quem decide isso é o `identifyDocumentKind`, não o campo.
   */
  test('há um campo só para o documento da empresa', () => {
    const companyFields = DOCUMENT_FIELDS.filter((document) => document.type === 'company_document')

    expect(companyFields).toHaveLength(1)
    expect(companyFields[0]?.label).toBe('Documento da empresa')
  })

  /** CNH e comprovante anexam e **não escrevem campo nenhum**. */
  test('só o CRLV e o documento da empresa leem; CNH e comprovante não', () => {
    const readers = Object.fromEntries(
      DOCUMENT_FIELDS.map((document) => [document.type, document.reads]),
    )

    expect(readers).toEqual({
      address_proof: 'none',
      cnh: 'none',
      company_document: 'company',
      crlv: 'vehicle',
    })
  })

  test('o comprovante de endereço não afirma prazo de validade', () => {
    const proof = DOCUMENT_FIELDS.find((document) => document.type === 'address_proof')

    expect(proof?.hint).toContain('qualquer data')
    expect(proof?.hint).not.toContain('90')
  })
})

describe('o bloco Empresa aparece pelo CNPJ lido ou digitado', () => {
  const CNPJ = '30.213.061/0001-06'

  test('abre pelo CNPJ digitado', () => {
    expect(shouldShowCompanyBlock({ readTaxId: undefined, typedTaxId: CNPJ })).toBe(true)
  })

  /** Com a etapa de documentos no topo não há CNPJ digitado ainda quando o CCMEI chega. */
  test('abre pelo CNPJ lido do documento, sem nada digitado', () => {
    expect(shouldShowCompanyBlock({ readTaxId: '30213061000106', typedTaxId: '' })).toBe(true)
  })

  test('abre para quem digitou CPF e anexou o CCMEI da própria empresa', () => {
    expect(
      shouldShowCompanyBlock({ readTaxId: '30213061000106', typedTaxId: '111.444.777-35' }),
    ).toBe(true)
  })

  test('não abre com CPF e sem documento', () => {
    expect(shouldShowCompanyBlock({ readTaxId: undefined, typedTaxId: '111.444.777-35' })).toBe(
      false,
    )
  })

  test('não abre com CNPJ pela metade', () => {
    expect(shouldShowCompanyBlock({ readTaxId: undefined, typedTaxId: '30.213' })).toBe(false)
  })
})

describe('a lista de anexos mostra o estado por linha', () => {
  test('cada linha imprime o nome do arquivo, o estado e o botão de remover', () => {
    expect(FORM_SOURCE).toContain('{entry.fileName}')
    expect(FORM_SOURCE).toContain('{describeAttachmentEntry(entry)}')
    expect(FORM_SOURCE).toContain('attachments.remove(entry.id)')
  })

  /** A lista subiu para a etapa de documentos junto com os campos que a alimentam. */
  test('a lista mora na etapa de documentos, não no bloco Empresa', () => {
    const documentsBlock = FORM_SOURCE.indexOf('PRE_REGISTRATION_BLOCKS[0]')
    const companyBlock = FORM_SOURCE.indexOf('PRE_REGISTRATION_BLOCKS[2]')
    const list = FORM_SOURCE.indexOf('attachments.entries.map')

    expect(list).toBeGreaterThan(documentsBlock)
    expect(list).toBeLessThan(companyBlock)
  })
})
