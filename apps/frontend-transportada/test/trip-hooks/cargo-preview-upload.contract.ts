/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (RF4, RF5): enviar a planilha montado de verdade — só contratante com recebimento E prévia
 * ligados, tamanho (960 KiB) e tipo conferidos no cliente, o `Idempotency-Key` estável por tentativa, o 200
 * de "essa planilha já foi enviada", o 413 e o 422 explicados, e a recusa do servidor nomeando todos os
 * campos (`web.md` §11). Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoPreviewListPanel } from '@/modules/cargo-receiving/components/CargoPreviewListPanel.component'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { ALFA_ID } from '../fixtures/cargoReceiving.fixture'
import {
  chooseFile,
  installCargoPreviewDouble,
  sheetFile,
  type CargoPreviewDouble,
} from './cargoPreviewHarness.helper'
import {
  buttonByText,
  click,
  installCargoReceivingDouble,
  networkFailure,
  resetLocation,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

async function mountUpload(
  options: Partial<CargoPreviewDouble> = {},
  receiving: Partial<CargoReceivingDouble> = {},
) {
  resetLocation('/recebimento/previas')
  installCargoReceivingDouble(receiving)
  const double = installCargoPreviewDouble(options)
  const rendered = await renderWithQueryClient(
    createElement(CargoPreviewListPanel, { canManage: true }),
  )
  await waitFor(() => expect(document.querySelectorAll('[aria-busy="true"]').length).toBe(0))
  return { double, rendered }
}

const contractorButton = () =>
  document.querySelector('button[aria-label="Contratante da planilha"]') as HTMLButtonElement
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement
const panelText = () =>
  (document.querySelector('[data-preview-upload]') as HTMLElement).textContent ?? ''

async function chooseContractor(name: string): Promise<void> {
  await waitFor(() => expect(contractorButton().disabled).toBe(false))
  await click(contractorButton())
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (item) => item.textContent?.trim() === name,
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${name}`)
  await click(option as HTMLElement)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('quem pode receber a planilha', () => {
  test('só lista contratante com o recebimento E a prévia ligados, e explica o porquê', async () => {
    const { rendered } = await mountUpload()
    await waitFor(() => expect(contractorButton().disabled).toBe(false))

    await click(contractorButton())

    expect(
      [...document.querySelectorAll('[role="option"]')].map((item) => item.textContent?.trim()),
    ).toEqual(['Alfa Indústria Fictícia'])
    expect(panelText()).toContain('Só aparecem contratantes com o recebimento e a prévia ligados')
    rendered.unmount()
  })

  test('sem nenhum contratante elegível explica o motivo e leva à ficha dos contratantes', async () => {
    const { rendered } = await mountUpload({}, { profiles: [] })
    await waitFor(() => expect(panelText()).toContain('Nenhum contratante com a prévia ligada'))

    await click(buttonByText('Abrir contratantes'))

    expect(window.location.pathname).toBe('/clientes')
    expect(window.location.search).toBe('?tab=contractors')
    rendered.unmount()
  })
})

describe('a validação no cliente', () => {
  test('sem contratante e sem arquivo aponta os dois, e não chama o servidor', async () => {
    const { double, rendered } = await mountUpload()

    await click(buttonByText('Enviar planilha'))

    expect(double.calls.upload).toHaveLength(0)
    expect(panelText()).toContain('Escolha o contratante.')
    expect(panelText()).toContain('Escolha a planilha.')
    rendered.unmount()
  })

  test('arquivo acima de 960 KB é recusado com mensagem clara, antes de subir', async () => {
    const { double, rendered } = await mountUpload()
    await chooseContractor('Alfa Indústria Fictícia')
    await chooseFile(fileInput(), sheetFile({ bytes: 960 * 1024 + 1 }))

    await click(buttonByText('Enviar planilha'))

    expect(double.calls.upload).toHaveLength(0)
    expect(panelText()).toContain('A planilha tem mais de 960 KB. Envie uma de até 960 KB.')
    rendered.unmount()
  })

  test('960 KB exatos sobem; extensão errada é recusada no cliente', async () => {
    const { double, rendered } = await mountUpload()
    await chooseContractor('Alfa Indústria Fictícia')

    await chooseFile(fileInput(), sheetFile({ name: 'FR.csv' }))
    await click(buttonByText('Enviar planilha'))
    expect(panelText()).toContain('Use um arquivo .xlsx ou .xlsm.')
    expect(double.calls.upload).toHaveLength(0)

    await chooseFile(fileInput(), sheetFile({ bytes: 960 * 1024 }))
    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(double.calls.upload).toHaveLength(1))
    rendered.unmount()
  })

  test('o erro de campo é do próprio campo: aria-invalid e aria-describedby apontando para a mensagem', async () => {
    const { rendered } = await mountUpload()

    await click(buttonByText('Enviar planilha'))

    const input = fileInput()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const message = document.getElementById(input.getAttribute('aria-describedby') ?? '')
    expect(message?.textContent).toContain('Escolha a planilha.')
    rendered.unmount()
  })
})

describe('o envio e o Idempotency-Key por tentativa', () => {
  test('o envio vai com contratante, arquivo e chave e abre a prévia criada', async () => {
    const { double, rendered } = await mountUpload()
    await chooseContractor('Alfa Indústria Fictícia')
    await chooseFile(fileInput(), sheetFile({ name: 'FR-05-10.xlsm' }))

    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(double.calls.upload).toHaveLength(1))

    expect(double.calls.upload[0]?.contractorId).toBe(ALFA_ID)
    expect(double.calls.upload[0]?.fileName).toBe('FR-05-10.xlsm')
    expect(double.calls.upload[0]?.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{16,256}$/u)
    await waitFor(() =>
      expect(window.location.pathname).toMatch(/^\/recebimento\/previas\/[0-9a-f-]{36}$/u),
    )
    rendered.unmount()
  })

  test('o MESMO envio repetido reaproveita a chave; outro arquivo gera chave nova', async () => {
    const { double, rendered } = await mountUpload({ uploadFailure: networkFailure() })
    await chooseContractor('Alfa Indústria Fictícia')
    await chooseFile(fileInput(), sheetFile({ name: 'FR-05-10.xlsm' }))

    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(double.calls.upload).toHaveLength(1))
    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(double.calls.upload).toHaveLength(2))
    expect(double.calls.upload[1]?.idempotencyKey).toBe(double.calls.upload[0]?.idempotencyKey)

    await chooseFile(fileInput(), sheetFile({ name: 'FR-06-10.xlsm' }))
    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(double.calls.upload).toHaveLength(3))
    expect(double.calls.upload[2]?.idempotencyKey).not.toBe(double.calls.upload[0]?.idempotencyKey)
    rendered.unmount()
  })

  test('a chave não muda a cada render: mexer no filtro entre as tentativas não a troca', async () => {
    const { double, rendered } = await mountUpload({ uploadFailure: networkFailure() })
    await chooseContractor('Alfa Indústria Fictícia')
    await chooseFile(fileInput(), sheetFile())
    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(double.calls.upload).toHaveLength(1))

    await click(document.querySelector('thead th button') as HTMLElement)
    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(double.calls.upload).toHaveLength(2))

    expect(double.calls.upload[1]?.idempotencyKey).toBe(double.calls.upload[0]?.idempotencyKey)
    rendered.unmount()
  })

  test('200 diz que essa planilha já foi enviada e leva a ela, sem criar outra', async () => {
    const { double, rendered } = await mountUpload({ uploadIsReplay: true })
    await chooseContractor('Alfa Indústria Fictícia')
    await chooseFile(fileInput(), sheetFile())

    await click(buttonByText('Enviar planilha'))
    await waitFor(() => expect(panelText()).toContain('Essa planilha já foi enviada.'))
    expect(double.calls.upload).toHaveLength(1)
    expect(window.location.pathname).toBe('/recebimento/previas')

    await click(buttonByText('Abrir a prévia'))
    expect(window.location.pathname).toMatch(/^\/recebimento\/previas\/[0-9a-f-]{36}$/u)
    rendered.unmount()
  })
})

describe('os erros do servidor', () => {
  async function failWith(error: Error) {
    const { rendered } = await mountUpload({ uploadFailure: error })
    await chooseContractor('Alfa Indústria Fictícia')
    await chooseFile(fileInput(), sheetFile())
    await click(buttonByText('Enviar planilha'))
    await settle()
    return rendered
  }

  test('413 diz que a planilha passa do limite aceito pelo servidor', async () => {
    const rendered = await failWith(new CargoReceivingRequestError('PREVIEW_FILE_TOO_LARGE'))

    expect(document.querySelector('[data-preview-upload] [role="alert"]')?.textContent).toContain(
      'A planilha passa do limite de 960 KB',
    )
    rendered.unmount()
  })

  test('422 de prévia desligada explica o motivo e leva à ficha do contratante', async () => {
    const rendered = await failWith(new CargoReceivingRequestError('CARGO_PREVIEW_NOT_ENABLED'))

    expect(panelText()).toContain('A prévia não está ligada para este contratante.')
    await click(buttonByText('Abrir contratantes'))
    expect(window.location.search).toBe('?tab=contractors')
    rendered.unmount()
  })

  test('arquivo que não é planilha diz isso em português, sem o código', async () => {
    const rendered = await failWith(new CargoReceivingRequestError('PREVIEW_NOT_A_WORKBOOK'))

    expect(panelText()).toContain('não é uma planilha')
    expect(panelText()).not.toContain('PREVIEW_NOT_A_WORKBOOK')
    rendered.unmount()
  })

  test('a recusa nomeia TODOS os campos, cada um com atalho que leva o foco ao campo', async () => {
    const rendered = await failWith(
      new CargoReceivingRequestError('INVALID_REQUEST', [
        { field: 'contractorId', message: 'One contractor id is required' },
        { field: 'file', message: 'One file is required' },
      ]),
    )

    const summary = document.querySelector('[data-refusal-summary]') as HTMLElement
    expect(summary.textContent).toContain('Confira:')
    expect([...summary.querySelectorAll('button')].map((item) => item.textContent)).toEqual([
      'Contratante',
      'Planilha da prévia',
    ])
    await click(buttonByText('Planilha da prévia', summary))
    expect(document.activeElement === fileInput()).toBe(true)
    rendered.unmount()
  })

  test('falha sem campo nenhum não monta lista de campos', async () => {
    const rendered = await failWith(new CargoReceivingRequestError('CARGO_PREVIEW_KEY_REUSED'))

    expect(document.querySelector('[data-refusal-summary]')).toBeNull()
    expect(panelText()).toContain('Esta tentativa já foi usada com outra planilha')
    rendered.unmount()
  })

  /** Revisão de segurança S5: a fila do contratante tem teto, e a tela diz o que fazer. */
  test('fila do contratante cheia explica que é preciso esperar a leitura das outras', async () => {
    const rendered = await failWith(new CargoReceivingRequestError('CARGO_PREVIEW_TOO_MANY_OPEN'))

    expect(panelText()).toContain('Este contratante já tem 5 prévias esperando leitura.')
    rendered.unmount()
  })

  test('sem conexão diz isso, e o arquivo e o contratante escolhidos não se perdem', async () => {
    const { double, rendered } = await mountUpload({ uploadFailure: networkFailure() })
    await chooseContractor('Alfa Indústria Fictícia')
    await chooseFile(fileInput(), sheetFile({ name: 'FR-05-10.xlsm' }))

    await click(buttonByText('Enviar planilha'))
    await settle()

    expect(panelText()).toContain('Sem conexão com o servidor.')
    expect(panelText()).toContain('FR-05-10.xlsm')
    expect(double.calls.upload).toHaveLength(1)
    rendered.unmount()
  })
})
