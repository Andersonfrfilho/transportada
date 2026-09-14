/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { buildStopAddressKey } from '../../src/modules/trip/shared/stopAddressKey.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ASSEMBLY_MAP_PATH = 'src/modules/trip/components/TripAssemblyMap.component.tsx'
const MAP_NOTE_PATH = 'src/modules/trip/shared/assemblyMapNote.service.ts'
const WORKSPACE_CLIENT_PATH = 'src/modules/nfe-workspace/shared/nfeWorkspaceClient.service.ts'

function readSource(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

/**
 * O telefone do destinatário já era importado da NF-e e guardado em `nfe_addresses`; o que faltava
 * era o caminho até a tela. Quem monta a viagem liga para o cliente antes de o caminhão sair.
 *
 * A fiação é cobrada **por texto de fonte** porque o teste desta app não tem DOM: trocar
 * `formatStoredPhone` pelo `formatPhone` da máscara de digitação compila, passa em todo teste de
 * caminho feliz, e só aparece como um DDD inventado na tela de quem vai discar.
 */
describe('telefone do destinatário na parada da montagem', () => {
  test('a listagem de notas publica o telefone cru', () => {
    const source = readSource(WORKSPACE_CLIENT_PATH)

    expect(source).toContain('recipientPhone: null | string')
    expect(source).toContain('isNullableString(value.recipientPhone)')
  })

  test('o recorte que o mapa lê da nota carrega o telefone', () => {
    expect(readSource(MAP_NOTE_PATH)).toContain('phone: document.recipientPhone,')
  })

  test('a parada imprime o telefone pelo formatador de valor guardado, não pela máscara de digitação', () => {
    const source = readSource(ASSEMBLY_MAP_PATH)

    expect(source).toContain("formatStoredPhone } from '@/modules/shared/phone.service'")
    expect(source).toContain('formatStoredPhone(note.phone)')
    expect(source).not.toContain('formatPhone(note.phone)')
  })

  /** O botão é o primitivo do design system, não um `<button>` com `navigator.clipboard` à mão. */
  test('o botão de copiar vem do design system, na variante em linha', () => {
    const source = readSource(ASSEMBLY_MAP_PATH)

    expect(source).toContain("import { CopyButton } from '@/components/ui/copy-button'")
    expect(source).toContain('variant="inline"')
    expect(source).toContain('value={note.phone}')
    expect(source).not.toContain('navigator.clipboard')
  })

  /**
   * ⚠️ Copia-se o **cru**, e imprime-se o formatado. Colar `(16) 3977-1234` num discador ou numa
   * planilha obriga quem recebe a limpar a pontuação — e é justamente para não digitar que se copia.
   */
  test('copia o número como veio, não o texto com máscara', () => {
    const source = readSource(ASSEMBLY_MAP_PATH)

    expect(source).not.toContain('value={formatStoredPhone(note.phone)}')
  })

  /** Nota sem `<fone>` é o caso comum: um botão de copiar apontando para o vazio é ruído por linha. */
  test('a linha só aparece quando a nota trouxe telefone', () => {
    const source = readSource(ASSEMBLY_MAP_PATH)

    expect(source).toContain("note.phone === null || note.phone.trim() === '' ? null : (")
  })

  /**
   * A parada é `(município, CEP, número)`. Duas notas do mesmo endereço com telefones diferentes —
   * o comprador numa e o gerente da loja noutra — continuam sendo uma parada só, senão o mesmo
   * portão viraria dois pontos no roteiro.
   */
  test('o telefone não entra na chave da parada', () => {
    const address = { cityCode: '3543402', number: '289', postalCode: '14078369' }

    expect(buildStopAddressKey(address)).toBe(buildStopAddressKey({ ...address }))
    expect(readSource(ASSEMBLY_MAP_PATH)).not.toContain('phone: note.phone,')
  })
})
