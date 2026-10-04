/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O painel de tipos de ocorrência vive em três componentes (painel, linha, formulário de cadastro)
 * e o hook do rascunho do cadastro; os contratos de texto leem tudo como um só código-fonte.
 */
import { readFileSync } from 'node:fs'

const PANEL_FILES = [
  'OccurrenceTypeCatalogPanel.component.tsx',
  'OccurrenceTypeRow.component.tsx',
  'OccurrenceTypeCreateForm.component.tsx',
] as const

const HOOK_FILES = ['useOccurrenceTypeCreateDraft.hook.ts'] as const

export function readOccurrenceTypePanelSource(): string {
  const components = PANEL_FILES.map((fileName) =>
    readFileSync(
      new URL(`../../src/modules/company-settings/components/${fileName}`, import.meta.url),
      'utf8',
    ),
  )
  const hooks = HOOK_FILES.map((fileName) =>
    readFileSync(
      new URL(`../../src/modules/company-settings/hooks/${fileName}`, import.meta.url),
      'utf8',
    ),
  )
  return [...components, ...hooks].join('\n')
}
