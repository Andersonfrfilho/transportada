/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveSeparationOccurrenceButtonVisibility } from '../../src/modules/trip/shared/separationOccurrenceButton.service'
import type { OccurrenceType } from '../../src/modules/trip/shared/occurrence.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readFile(path: string): Promise<string> {
  return Bun.file(new URL(path, APPLICATION_ROOT)).text()
}

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: 'type-1',
    name: 'Avaria',
    notifies: false,
    stage: 'separation',
    ...overrides,
  }
}

/**
 * Pedido: "toda nota que está na viagem para separar" precisa do botão de ocorrência de separação,
 * enquanto a viagem ainda está editável e a empresa tem tipo ativo de galpão cadastrado.
 */
describe('visibilidade do botão de ocorrência de separação na linha da nota', () => {
  test('aparece com viagem editável, trip.manage e tipo de separação ativo', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [buildType()],
      }),
    ).toBe(true)
  })

  test('não aparece sem trip.manage', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: false,
        isEditable: true,
        types: [buildType()],
      }),
    ).toBe(false)
  })

  test('não aparece com a viagem despachada (não editável)', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: false,
        types: [buildType()],
      }),
    ).toBe(false)
  })

  test('não aparece quando só existem tipos de rua (delivery)', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [buildType({ id: 'street', stage: 'delivery' })],
      }),
    ).toBe(false)
  })

  test('não aparece quando o único tipo de separação está aposentado', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [buildType({ active: false })],
      }),
    ).toBe(false)
  })

  test('não aparece sem nenhum tipo cadastrado', () => {
    expect(
      resolveSeparationOccurrenceButtonVisibility({
        canManage: true,
        isEditable: true,
        types: [],
      }),
    ).toBe(false)
  })
})

/**
 * Varredura de fonte: prova que o botão está na linha da nota (`TripStopList`, não só no
 * comprovante) e que ele abre o registro de ocorrência de separação — sem suíte de render, o
 * contrato do módulo é a fonte grepada (`apps/frontend-transportada/CLAUDE.md`).
 */
describe('varredura de fonte: botão na linha da nota', () => {
  test('TripStopList renderiza o botão de ocorrência de separação por nota', async () => {
    const source = await readFile('src/modules/trip/components/TripStopList.component.tsx')

    expect(source).toContain('canSeparationOccurrence')
    expect(source).toContain('onOpenSeparationOccurrence(document.id)')
    expect(source).toMatch(
      /actions\.separationOccurrence[\s\S]{0,200}?name="alert"|name="alert"[\s\S]{0,200}?actions\.separationOccurrence/,
    )
  })

  test('TripDetail abre o diálogo de ocorrência de separação a partir da linha da nota', async () => {
    const source = await readFile('src/modules/trip/components/TripDetail.component.tsx')

    expect(source).toContain('SeparationOccurrenceDialog')
    expect(source).toContain('onOpenSeparationOccurrence')
    expect(source).toContain('resolveSeparationOccurrenceButtonVisibility')
  })

  test('SeparationOccurrenceDialog reaproveita TripOccurrences, não duplica o formulário', async () => {
    const source = await readFile(
      'src/modules/trip/components/SeparationOccurrenceDialog.component.tsx',
    )

    expect(source).toContain('TripOccurrences')
    expect(source).toContain('useModalDialog')
  })

  /**
   * B1 (revisão spec 161): registrar a ocorrência A e, sem recarregar, registrar B na mesma nota (ou
   * noutra) fazia B virar anexo de A — `occurrencePhotoOccurrenceIdRef` do hook não tinha ninguém
   * chamando `resetSeparationOccurrencePhotoSend`. A correção liga o reset ao abrir o formulário, ao
   * cancelar e no início de cada novo registro.
   */
  test('TripOccurrences reseta a sessão de envio ao abrir/cancelar o formulário e ao começar um novo registro', async () => {
    const source = await readFile('src/modules/trip/components/TripOccurrences.component.tsx')

    expect(source).toContain('onReset: () => void')
    expect(source).toMatch(/onReset\(\)[\s\S]{0,80}setIsOpen\(true\)/)
    expect(source).toMatch(/onReset\(\)[\s\S]{0,80}setIsOpen\(false\)/)
    expect(source).toMatch(/function handleSubmit\(\)[\s\S]{0,200}onReset\(\)/)
  })

  test('SeparationOccurrenceDialog e TripDetail repassam o reset da sessão de fotos ao TripOccurrences', async () => {
    const dialogSource = await readFile(
      'src/modules/trip/components/SeparationOccurrenceDialog.component.tsx',
    )
    expect(dialogSource).toContain('onReset')

    const detailSource = await readFile('src/modules/trip/components/TripDetail.component.tsx')
    expect(detailSource).toContain('workspace.resetSeparationOccurrencePhotoSend')
  })

  /**
   * B2 (revisão spec 161): `onRegister` não lançava e o componente limpava/fechava o formulário
   * antes de saber o resultado — falha parcial perdia as fotos que não foram, sem jeito de
   * reenviar só elas. `handleSubmit` precisa aguardar `hasFailure` antes de limpar, e o botão de
   * reenvio precisa existir para retomar a mesma fila sem `onReset`.
   */
  test('TripOccurrences só limpa o formulário quando o registro não deixa foto para trás, e oferece reenviar as falhas', async () => {
    const source = await readFile('src/modules/trip/components/TripOccurrences.component.tsx')

    expect(source).toContain('photoSendState')
    expect(source).toMatch(/async function handleSubmit\(\)[\s\S]{0,200}await onRegister/)
    expect(source).toContain('function handleRetryFailed')
    expect(source).toContain('hasOccurrencePhotoSendFailure(photoSendState)')
  })

  test('TripDetail e SeparationOccurrenceDialog repassam photoSendState ao TripOccurrences', async () => {
    const detailSource = await readFile('src/modules/trip/components/TripDetail.component.tsx')
    expect(detailSource).toContain('photoSendState={workspace.occurrencePhotoSendState}')

    const dialogSource = await readFile(
      'src/modules/trip/components/SeparationOccurrenceDialog.component.tsx',
    )
    expect(dialogSource).toContain('photoSendState')
  })
})
