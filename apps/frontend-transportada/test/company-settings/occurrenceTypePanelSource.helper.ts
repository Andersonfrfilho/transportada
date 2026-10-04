/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O painel de tipos de ocorrência vive em três componentes (painel, linha, formulário de cadastro);
 * os contratos de texto leem os três como um só código-fonte.
 */
import { readFileSync } from 'node:fs'

const PANEL_FILES = [
  'OccurrenceTypeCatalogPanel.component.tsx',
  'OccurrenceTypeRow.component.tsx',
  'OccurrenceTypeCreateForm.component.tsx',
] as const

export function readOccurrenceTypePanelSource(): string {
  return PANEL_FILES.map((fileName) =>
    readFileSync(
      new URL(`../../src/modules/company-settings/components/${fileName}`, import.meta.url),
      'utf8',
    ),
  ).join('\n')
}
