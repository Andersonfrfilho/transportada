/* Copyright (c) 2026 Ada Technology. MIT License. */
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEnglish from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'

/**
 * Spec 218 (RF-A5, D1, D4): o "Registrar ocorrência" da nota (só depois do "Cheguei", sem foto) e o
 * "Deu problema" da parada (antes do "Cheguei", foto por `kind` fixo) viram um botão só, por nota e
 * sempre visível. O formulário é um componente próprio, com a foto **da ocorrência** — nunca a
 * captura do canhoto (`ProofCaptureFields`), que levaria a foto para o comprovante (spec 209).
 */
function source(path: string): string {
  return readFileSync(new URL(`../../src/modules/driver-trip/${path}`, import.meta.url), 'utf8')
}

const CARD_PATH = 'components/DriverStopCard.component.tsx'
const FORM_PATH = 'components/DriverOccurrenceRegistrationForm.component.tsx'
const HOOK_PATH = 'hooks/useOccurrenceRegistrationForm.hook.ts'
const SERVICE_PATH = 'shared/occurrenceRegistration.service.ts'
const PAGE_PATH = 'pages/DriverTripWorkspace.page.tsx'

function exists(path: string): boolean {
  return existsSync(new URL(`../../src/modules/driver-trip/${path}`, import.meta.url))
}

describe('um botão só, por nota e sempre visível (D4)', () => {
  it('os dois caminhos antigos saíram', () => {
    expect(exists('components/DriverStopOccurrenceForm.component.tsx')).toBe(false)
    expect(exists('hooks/useStopOccurrenceForm.hook.ts')).toBe(false)
    const card = source(CARD_PATH)
    expect(card).not.toInclude('DriverStopOccurrenceForm')
    expect(card).not.toInclude('occurrenceTypes.types.map(')
  })

  it('o cartão monta o formulário único', () => {
    expect(exists(FORM_PATH)).toBe(true)
    expect(source(CARD_PATH)).toInclude('<DriverOccurrenceRegistrationForm')
  })

  /** Nota entregue também ganha o botão — cobrança inesperada acontece depois da entrega. */
  it('o botão fica fora do "Cheguei": na nota em aberto e na nota já resolvida', () => {
    const card = source(CARD_PATH)
    const start = card.indexOf('{canActOnDocuments ? (')
    const end = card.indexOf("t('arrivalRequired')")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(card.slice(start, end)).not.toInclude('DocumentOccurrenceEntry')
    expect(card.match(/<DocumentOccurrenceEntry/gu)?.length).toBe(2)
  })

  it('rótulo curto, com ícone e dica — pedido do usuário', () => {
    expect(driverTrip.occurrenceRegistration.open).toBe('Ocorrência')
    expect(driverTripEnglish.occurrenceRegistration.open).toBe('Occurrence')
    const card = source(CARD_PATH)
    expect(card).toInclude("title={t('occurrenceRegistration.openHint')}")
    expect(card).toInclude("{t('occurrenceRegistration.open')}")
  })
})

describe('o formulário único', () => {
  it('lista os tipos como escolha única, cada um com o que pede de foto', () => {
    const form = source(FORM_PATH)
    expect(form).toInclude('role="radiogroup"')
    expect(form).toInclude('occurrenceRegistration.attachment.')
    for (const mode of ['off', 'optional', 'required'] as const) {
      expect(driverTrip.occurrenceRegistration.attachment[mode]).toBeString()
      expect(driverTripEnglish.occurrenceRegistration.attachment[mode]).toBeString()
    }
  })

  it('a foto é da ocorrência — nunca a captura nem a fila do canhoto', () => {
    const form = source(FORM_PATH)
    expect(form).not.toInclude('ProofCaptureFields')
    expect(form).not.toInclude('onProof')
    expect(form).toInclude('FilePickerButton')
    expect(form).toInclude('capture="environment"')
    expect(form.match(/useCameraCaptureFieldRef\(\)/gu)?.length).toBe(2)
  })

  it('o gate e a rota vêm do serviço, que reaproveita a regra do comprovante', () => {
    const form = source(FORM_PATH)
    expect(form).toInclude('canRegisterOccurrence(')
    expect(form).toInclude('listMissingOccurrenceFields(')
    expect(form).toInclude('dispatchOccurrenceRegistration(')
    const service = source(SERVICE_PATH)
    expect(service).toInclude('listMissingProofFields')
    expect(service).toInclude('resolveProofFormPlan')
  })

  /** A prévia do aviso é da parada: só o tipo de parada tem o stopKind que escolhe o template. */
  it('a prévia do aviso sai do stopKind do tipo, nunca do nome', () => {
    const form = source(FORM_PATH)
    expect(form).toInclude('renderOccurrenceNoticePreview')
    expect(form).toInclude('stopKind')
  })

  it('a foto é reduzida no aparelho, e o formulário aberto segura a atualização', () => {
    const hook = source(HOOK_PATH)
    expect(hook).toInclude('reduceOccurrencePhotoToJpeg')
    expect(hook).toInclude('isOccurrencePhotoWithinLimit')
    expect(hook).toInclude("useCaptureRegistration('occurrence-dialog', true)")
  })
})

describe('a página liga as três rotas', () => {
  it('parada vai com o tipo do catálogo; foto obrigatória nunca é derrubada pela fila', () => {
    const page = source(PAGE_PATH)
    expect(page).toInclude('occurrenceTypeId: input.occurrenceTypeId')
    expect(page).toInclude('isPhotoRequired')
    expect(page).toInclude('reportAllOrNothing')
  })

  it('nota com foto vai pelo item documentOccurrence da fila (D3)', () => {
    const page = source(PAGE_PATH)
    expect(page).toInclude("kind: 'documentOccurrence'")
  })
})
