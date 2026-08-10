/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_RESPONSE,
  EMPTY_COMPANY_SETTINGS_RESPONSE,
  loadFutureModule,
} from './company-settings.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
/** A fonte da verdade dos códigos é o domínio da API; o frontend só pode ficar para trás dela. */
const API_CERTIFICATE_ERRORS = new URL(
  '../../../api-transportada/src/companies/domain/digital-certificate.error.ts',
  import.meta.url,
)
const STATUS_MODULE_PATH =
  '../../src/modules/company-settings/shared/certificateUploadStatus.service'
const VIEW_MODEL_PATH = '../../src/modules/company-settings/shared/companySettingsViewModel.service'

type CertificateUploadStatus = Readonly<{ code?: string; key: string }>

type StatusModule = {
  readonly resolveCertificateUploadStatus: (error: unknown) => CertificateUploadStatus
}

type ViewModelModule = {
  readonly createCompanySettingsViewModel: (input: {
    readonly data?: unknown
    readonly status: 'error' | 'loading' | 'success'
  }) => Readonly<{ hasFiscalProfileSaved: boolean; status: string }>
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readForm(): Promise<string> {
  return readModule('src/modules/company-settings/components/CertificateUploadForm.component.tsx')
}

describe('certificate upload recovery contract', () => {
  /**
   * Senha errada é o erro mais comum deste formulário e o único que o usuário resolve sozinho.
   * A API colapsa PFX inválido, senha errada, CNPJ de outra empresa e validade fora da janela num
   * `DIGITAL_CERTIFICATE_REJECTED` só, de propósito — a rota não vira oráculo de certificado
   * alheio. Colapsar a causa é decisão de segurança; devolver o código cru na tela não é: o
   * usuário precisa saber o que conferir, e as quatro causas cabem numa frase.
   */
  test('a rejeição do certificado vira mensagem própria, não código cru na tela', async () => {
    const { resolveCertificateUploadStatus } =
      await loadFutureModule<StatusModule>(STATUS_MODULE_PATH)

    expect(resolveCertificateUploadStatus(new Error('DIGITAL_CERTIFICATE_REJECTED'))).toMatchObject(
      {
        key: 'certificateErrorRejected',
      },
    )
  })

  /**
   * Sem esta amarra o frontend fica para trás em silêncio: a API ganha um código novo, e a tela
   * responde "Código: X" a quem nunca vai saber o que X quer dizer. O `certificateError` genérico
   * existe para o inesperado, não para o que o domínio já enumera.
   */
  test('todo código que a API de certificados devolve tem mensagem própria no frontend', async () => {
    const { resolveCertificateUploadStatus } =
      await loadFutureModule<StatusModule>(STATUS_MODULE_PATH)
    const source = await Bun.file(API_CERTIFICATE_ERRORS).text()
    const codes = [...source.matchAll(/code: '([A-Z_]+)'/g)].map(([, code]) => code)

    expect(codes.length).toBeGreaterThan(0)
    for (const code of codes) {
      expect({
        apiCode: code,
        ...resolveCertificateUploadStatus(new Error(code)),
      }).not.toMatchObject({ key: 'certificateError' })
    }
  })

  /**
   * Os `CERTIFICATE_*` são `rejectionCodes` internos do gateway de validação: o use case os
   * colapsa antes de responder, e nenhum deles atravessa o HTTP. Mensagem para código que não
   * chega dá a impressão de que o erro de certificado está tratado — foi o que escondeu a falta
   * de mensagem para a senha errada.
   */
  test('não sobra mensagem para código que a rota nunca devolve', async () => {
    const { resolveCertificateUploadStatus } =
      await loadFutureModule<StatusModule>(STATUS_MODULE_PATH)

    for (const code of [
      'CERTIFICATE_EXPIRED',
      'CERTIFICATE_INVALID',
      'CERTIFICATE_NOT_ICP_BRASIL',
      'CERTIFICATE_NOT_YET_VALID',
      'CERTIFICATE_VALIDATION_FAILED',
      'DIGITAL_CERTIFICATE_CNPJ_MISMATCH',
    ]) {
      expect({ apiCode: code, ...resolveCertificateUploadStatus(new Error(code)) }).toMatchObject({
        key: 'certificateError',
      })
    }
  })

  /**
   * O certificado é validado contra o CNPJ do cadastro fiscal, então sem cadastro a rota responde
   * 409 antes de olhar para a senha. Deixar o formulário aberto nesse estado transforma qualquer
   * tentativa em "salve o cadastro antes" — inclusive a tentativa com a senha certa.
   *
   * `status: 'empty'` não serve de sinal: ele também cobre `cte` ausente, e o certificado não
   * depende da configuração de CT-e.
   */
  test('o cadastro fiscal salvo é sinal explícito do view model', async () => {
    const { createCompanySettingsViewModel } =
      await loadFutureModule<ViewModelModule>(VIEW_MODEL_PATH)

    const saved = createCompanySettingsViewModel({
      data: COMPANY_SETTINGS_RESPONSE,
      status: 'success',
    })
    const empty = createCompanySettingsViewModel({
      data: EMPTY_COMPANY_SETTINGS_RESPONSE,
      status: 'success',
    })

    expect(saved.hasFiscalProfileSaved).toBe(true)
    expect(empty.hasFiscalProfileSaved).toBe(false)
    expect(createCompanySettingsViewModel({ status: 'loading' }).hasFiscalProfileSaved).toBe(false)
    expect(createCompanySettingsViewModel({ status: 'error' }).hasFiscalProfileSaved).toBe(false)
  })

  /** Não há render de React nos testes desta app: a ligação entre página e formulário é lida na fonte. */
  test('o formulário de certificado não abre antes do cadastro fiscal', async () => {
    const [page, form] = await Promise.all([
      readModule('src/modules/company-settings/pages/CompanySettings.page.tsx'),
      readForm(),
    ])

    expect(page).toContain('hasFiscalProfileSaved={props.viewModel.hasFiscalProfileSaved}')
    expect(form).toContain('hasFiscalProfileSaved')
    expect(form).toContain('certificateRequiresProfile')
  })

  /**
   * O `clear()` do controller roda no `finally` do submit: em desfecho nenhum o rascunho
   * sobrevive. Só que o nome do arquivo era apagado apenas no sucesso, e depois de um erro a tela
   * seguia anunciando `certificado-....pfx` sobre um rascunho vazio — o clique seguinte respondia
   * "selecione o arquivo PFX" apontando para o arquivo escrito ali. Foi o que travou o cadastro
   * depois da primeira senha errada.
   */
  test('a tela não continua anunciando um arquivo que o rascunho já não tem', async () => {
    const form = await readForm()

    expect(form).toContain('.finally(() => setFileName(null))')
    expect(form.split('setFileName(null)')).toHaveLength(2)
    expect(form).toContain('certificateDraftCleared')
  })
})
