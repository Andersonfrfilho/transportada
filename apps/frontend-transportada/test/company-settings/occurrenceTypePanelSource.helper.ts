/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O painel de tipos de ocorrência vive em quatro componentes (painel, linha, identificação, formulário de cadastro)
 * e o hook do rascunho do cadastro; os contratos de texto leem tudo como um só código-fonte.
 */
import { readFileSync } from 'node:fs'

const PANEL_FILES = [
  'OccurrenceTypeCatalogPanel.component.tsx',
  'OccurrenceTypeRow.component.tsx',
  'OccurrenceTypeIdentity.component.tsx',
  'OccurrenceTypeNotification.component.tsx',
  'OccurrenceTypeCreateForm.component.tsx',
] as const

const HOOK_FILES = ['useOccurrenceTypeCreateDraft.hook.ts'] as const

export function readOccurrenceTypePanelSource(): string {
  const components = PANEL_FILES.map((fileName) =>
    readFileSync(new URL(`../../src/modules/trip/components/${fileName}`, import.meta.url), 'utf8'),
  )
  const hooks = HOOK_FILES.map((fileName) =>
    readFileSync(new URL(`../../src/modules/trip/hooks/${fileName}`, import.meta.url), 'utf8'),
  )
  return [...components, ...hooks].join('\n')
}

function readSharedSource(fileName: string): string {
  return readFileSync(new URL(`../../src/modules/trip/shared/${fileName}`, import.meta.url), 'utf8')
}

/** O montador do corpo do `PUT` de toda edição do tipo aberto. */
export function readOccurrenceTypeUpdateSource(): string {
  return readSharedSource('occurrenceTypeUpdate.service.ts')
}

/** O montador do corpo do cadastro de tipo novo (os momentos derivam o grupo e o fluxo). */
export function readOccurrenceTypeCreateSource(): string {
  return readSharedSource('occurrenceTypeCreate.service.ts')
}
