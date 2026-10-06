/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve (`apps/api-transportada/src/shared/cargo-preview.constant.ts`). */
export const CARGO_PREVIEW_STATUSES = ['queued', 'processing', 'ready', 'failed'] as const
export const CARGO_PREVIEW_ITEM_STATES = [
  'matched',
  'awaiting_xml',
  'suggested',
  'ambiguous',
  'invalid',
] as const
export const CARGO_PREVIEW_DECIDERS = ['system', 'user'] as const
export const CARGO_PREVIEW_LOAD_ORIGINS = ['totals', 'user', 'votes'] as const
export const CARGO_PREVIEW_SOURCES = ['upload'] as const

/** A prévia ainda está na fila ou sendo lida: a tela repete a leitura até ela assentar. */
export const CARGO_PREVIEW_PENDING_STATUSES = ['queued', 'processing'] as const

export const CARGO_PREVIEW_PATHS = {
  previews: '/cargo-previews',
} as const

export const CARGO_PREVIEW_LIMITS = {
  /** O teto do servidor (`CARGO_PREVIEW_UPLOAD_MAX_BYTES`): 960 KiB, não os 5 MiB do leitor (ADR-0094 §8). */
  fileMaxBytes: 960 * 1024,
  /** O teto da página da API; os itens seguem o cursor por linha de 100 em 100. */
  itemsPageSize: 100,
  pageSize: 100,
  /** Leve de propósito: o worker lê uma planilha em segundos, e a tela para sozinha ao assentar. */
  refetchIntervalMs: 3_000,
} as const

/** Só a extensão é conferida aqui, para falhar cedo; o servidor confere os bytes (segurança). */
export const CARGO_PREVIEW_ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm'] as const
export const CARGO_PREVIEW_ACCEPT_ATTRIBUTE = CARGO_PREVIEW_ACCEPTED_EXTENSIONS.join(',')

export const CARGO_PREVIEW_FORM_FIELDS = { contractorId: 'contractorId', file: 'file' } as const

/** O `422` de quem envia planilha para um contratante sem a prévia ligada no perfil. */
export const CARGO_PREVIEW_NOT_ENABLED_CODE = 'CARGO_PREVIEW_NOT_ENABLED'

/** O idioma de reserva dos formatadores de data e número, o mesmo do `useMomentFormatter`. */
export const CARGO_PREVIEW_DEFAULT_LOCALE = 'pt-BR'

/** A viagem de navegação: o rascunho da chegada que a prévia propôs vai em `history.state`. */
export const CARGO_PREVIEW_PREFILL_STATE_KEY = 'cargoArrivalPrefill'

export const CONTRACTORS_WORKSPACE_ROUTE = '/clientes?tab=contractors'
export const CONTRACTORS_WORKSPACE = 'delivery-clients'
