/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T903 (achado F5): a regra da fronteira entre módulos (`CLAUDE.md` do painel) — quem
 * precisa de uma ação de outro módulo importa só o componente de ação autocontido que o dono
 * exporta, nunca o diálogo, o formulário ou o hook internos. "Adicionar aos contatos" é ação de
 * `delivery-clients`: a conversa só decide quando oferecê-la.
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const ROOT = new URL('../../src/modules/', import.meta.url)

async function sourcesOf(module: string): Promise<readonly [string, string][]> {
  const entries = await readdir(new URL(`${module}/`, ROOT), { recursive: true })
  const files = entries.filter((entry) => /\.tsx?$/u.test(entry))
  return Promise.all(
    files.map(
      async (file) =>
        [file, await readFile(new URL(`${module}/${file}`, ROOT), 'utf8')] as [string, string],
    ),
  )
}

describe('a fronteira entre a conversa e os contatos (spec 183 T903, F5)', () => {
  test('a conversa não importa hook, formulário nem diálogo internos de delivery-clients', async () => {
    const offenders = (await sourcesOf('occurrence-conversation'))
      .filter(([, source]) =>
        /@\/modules\/delivery-clients\/(hooks\/|components\/(?!AddContractorContactAction\.component))/u.test(
          source,
        ),
      )
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })

  test('delivery-clients exporta a ação autocontida, com o botão, o diálogo e o próprio hook', async () => {
    const action = await readFile(
      new URL('delivery-clients/components/AddContractorContactAction.component.tsx', ROOT),
      'utf8',
    )
    expect(action).toContain('export function AddContractorContactAction')
    expect(action).toContain('useContractorContacts(')
    expect(action).toContain('<ContactForm')
    expect(action).toContain('createPortal(')
  })

  /**
   * A conversa lia `isRecord`/`isString` de `trip/shared/tripGuards`, e `trip` importa a conversa:
   * ciclo. Cada módulo tem o próprio arquivo de guardas (`fleetGuards`, `nfseInvoiceGuards`…).
   */
  test('a conversa tem as próprias guardas, sem ciclo com trip por elas', async () => {
    const offenders = (await sourcesOf('occurrence-conversation'))
      .filter(([, source]) => source.includes('@/modules/trip/shared/tripGuards.validation'))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})

