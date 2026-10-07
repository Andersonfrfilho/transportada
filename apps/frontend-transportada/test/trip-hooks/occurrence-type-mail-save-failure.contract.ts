/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.2b (N7/N8): o rascunho do e-mail à contratante só some quando o salvar POUSA — se o PUT falhar
 * ele sobrevive —, e o marcador que não cabe no teto do campo é dito em região viva, não ignorado.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { OccurrenceTypeContractorMail } from '../../src/modules/trip/components/OccurrenceTypeContractorMail.component'
import {
  createOccurrenceMailDraftStore,
  OccurrenceMailDraftStoreContext,
} from '../../src/modules/trip/hooks/useOccurrenceMailDraftStore.hook'
import type { OccurrenceType } from '../../src/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeEdit } from '../../src/modules/trip/shared/occurrenceTypeUpdate.service'

const TYPE_ID = 'type-1'
const SAVED = {
  emailBody: 'Corpo gravado',
  emailItemLineTemplate: '',
  emailSubject: 'Assunto gravado',
  emailsContractor: true,
  id: TYPE_ID,
  itemsMode: 'optional',
} as unknown as OccurrenceType

let root: Root | undefined
let container: HTMLDivElement | undefined

function build(type: OccurrenceType, edits: OccurrenceTypeEdit[]) {
  return createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    createElement(OccurrenceMailDraftStoreContext.Provider, {
      children: createElement(OccurrenceTypeContractorMail, {
        disabled: false,
        onEdit: (edit: OccurrenceTypeEdit) => void edits.push(edit),
        type,
      }),
      value: store,
    }),
  )
}

let store = createOccurrenceMailDraftStore()

async function render(type: OccurrenceType, edits: OccurrenceTypeEdit[]): Promise<void> {
  if (container === undefined) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  await act(async () => {
    root?.render(build(type, edits))
    await Promise.resolve()
  })
}

async function typeInto(label: string, text: string): Promise<void> {
  const field = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )
  if (field === null) throw new Error(`campo ausente: ${label}`)
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const descriptor = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(field, text)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

function findButton(pattern: RegExp): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    pattern.test(button.textContent ?? ''),
  )
}

async function click(button: HTMLButtonElement | undefined): Promise<void> {
  await act(async () => {
    button?.click()
    await Promise.resolve()
  })
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
    await Promise.resolve()
  })
  container?.remove()
  root = undefined
  container = undefined
  store = createOccurrenceMailDraftStore()
})

describe('rascunho do e-mail à contratante (spec 247 T7.2b)', () => {
  it('N8: salvar não descarta o rascunho antes da hora; o salvar que pousa o descarta', async () => {
    const edits: OccurrenceTypeEdit[] = []
    await render(SAVED, edits)
    await typeInto('Assunto', 'Assunto novo')
    await click(findButton(/^Salvar e-mail/u))
    expect(edits).toHaveLength(1)
    expect(store.read(TYPE_ID)?.emailSubject).toBe('Assunto novo')

    await render({ ...SAVED, emailSubject: 'Assunto novo' }, edits)
    expect(store.read(TYPE_ID)).toBeUndefined()
  })

  it('N8: se o PUT falhar (o guardado não muda), o texto digitado continua na tela e no guardião', async () => {
    const edits: OccurrenceTypeEdit[] = []
    await render(SAVED, edits)
    await typeInto('Assunto', 'Assunto novo')
    await click(findButton(/^Salvar e-mail/u))
    await render(SAVED, edits)
    expect(document.body.querySelector<HTMLInputElement>('[aria-label="Assunto"]')?.value).toBe(
      'Assunto novo',
    )
    expect(store.read(TYPE_ID)?.emailSubject).toBe('Assunto novo')
  })

  it('N7: marcador que estoura o teto do campo é avisado em região viva', async () => {
    await render(SAVED, [])
    await typeInto('Corpo', 'x'.repeat(4000))
    const marker = findButton(/^\{\{/u)
    await click(marker)
    const status = document.body.querySelector('[role="status"]')
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toContain('4000')
    expect(document.body.querySelector<HTMLTextAreaElement>('textarea')?.value).toHaveLength(4000)
  })
})
