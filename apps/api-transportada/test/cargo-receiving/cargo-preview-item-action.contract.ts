/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 9: a tabela das ações do operador sobre o item. Repetir é no-op; o que a
 * política recusa volta com código estável.
 */
import { describe, expect, test } from 'bun:test'

import {
  decideCargoPreviewItemAction,
  type CargoPreviewActionItem,
  type CargoPreviewItemAction,
} from '../../src/cargo-receiving/domain/cargo-preview-item-action.policy.js'

const DOCUMENT = 'doc-1'
const OTHER = 'doc-2'

function item(overrides: Partial<CargoPreviewActionItem>): CargoPreviewActionItem {
  return {
    matchState: 'awaiting_xml',
    matchedBy: null,
    matchedDocumentId: null,
    suggestedDocumentId: null,
    ...overrides,
  }
}

const matchedBySystem = item({
  matchState: 'matched',
  matchedBy: 'system',
  matchedDocumentId: DOCUMENT,
})
const matchedByUser = item({
  matchState: 'matched',
  matchedBy: 'user',
  matchedDocumentId: DOCUMENT,
})
const suggestion = item({
  matchState: 'suggested',
  matchedBy: 'system',
  suggestedDocumentId: DOCUMENT,
})
const unlinkedByUser = item({ matchedBy: 'user' })

const TABLE: readonly [
  string,
  CargoPreviewItemAction,
  CargoPreviewActionItem,
  string | undefined,
  unknown,
][] = [
  [
    'confirma a sugestão',
    'confirm',
    suggestion,
    undefined,
    { documentId: DOCUMENT, kind: 'apply' },
  ],
  [
    'confirma o vínculo automático',
    'confirm',
    matchedBySystem,
    undefined,
    { documentId: DOCUMENT, kind: 'apply' },
  ],
  ['confirmar de novo é no-op', 'confirm', matchedByUser, undefined, { kind: 'unchanged' }],
  [
    'não confirma o que espera o XML',
    'confirm',
    item({}),
    undefined,
    { code: 'CARGO_PREVIEW_ITEM_NOT_SUGGESTED', kind: 'refused' },
  ],
  [
    'não confirma o ambíguo',
    'confirm',
    item({ matchState: 'ambiguous' }),
    undefined,
    { code: 'CARGO_PREVIEW_ITEM_NOT_SUGGESTED', kind: 'refused' },
  ],
  [
    'desvincula o vinculado',
    'unlink',
    matchedBySystem,
    undefined,
    { documentId: DOCUMENT, kind: 'apply' },
  ],
  ['recusa a sugestão', 'unlink', suggestion, undefined, { documentId: null, kind: 'apply' }],
  ['desvincular de novo é no-op', 'unlink', unlinkedByUser, undefined, { kind: 'unchanged' }],
  [
    'não desvincula a linha inválida',
    'unlink',
    item({ matchState: 'invalid' }),
    undefined,
    { code: 'CARGO_PREVIEW_ITEM_INVALID', kind: 'refused' },
  ],
  [
    'vincula o que espera o XML',
    'link',
    item({}),
    DOCUMENT,
    { documentId: DOCUMENT, kind: 'apply' },
  ],
  [
    'vincula o ambíguo à candidata escolhida',
    'link',
    item({ matchState: 'ambiguous' }),
    OTHER,
    { documentId: OTHER, kind: 'apply' },
  ],
  ['vincular à mesma nota é no-op', 'link', matchedByUser, DOCUMENT, { kind: 'unchanged' }],
  [
    'vinculado a outra nota exige desvincular antes',
    'link',
    matchedBySystem,
    OTHER,
    { code: 'CARGO_PREVIEW_ITEM_ALREADY_LINKED', kind: 'refused' },
  ],
  [
    'não vincula a linha inválida',
    'link',
    item({ matchState: 'invalid' }),
    DOCUMENT,
    { code: 'CARGO_PREVIEW_ITEM_INVALID', kind: 'refused' },
  ],
]

describe('as ações do operador sobre o item (spec 237 RF5a)', () => {
  test.each(TABLE)('%s', (_label, action, current, documentId, expected) => {
    expect(
      decideCargoPreviewItemAction({
        action,
        item: current,
        ...(documentId === undefined ? {} : { documentId }),
      }),
    ).toEqual(expected as never)
  })
})
