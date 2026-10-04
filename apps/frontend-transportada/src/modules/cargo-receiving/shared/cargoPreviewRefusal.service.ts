/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RegistrationRefusal } from './cargoReceivingRefusal.service'
import { CargoReceivingRequestError } from './cargoReceivingRequest.service'

/**
 * `web.md` §11.4: o rótulo impresso é o que aparece, nunca o nome do corpo. O mapa mora aqui, num arquivo
 * só, e **campo sem rótulo conhecido não some do aviso**: sai com o nome que a API usou.
 */
const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  contractorId: 'preview.fields.contractorId',
  file: 'preview.fields.file',
}

/** Reaproveita o formato do aviso de recusa da chegada (nenhuma nota nomeada: só campos). */
export function describePreviewUploadRefusal(error: unknown): RegistrationRefusal {
  if (!(error instanceof CargoReceivingRequestError)) {
    return { code: undefined, documents: [], fields: [] }
  }
  const fields = new Map<string, RegistrationRefusal['fields'][number]>()
  for (const detail of error.details) {
    fields.set(detail.field, { field: detail.field, labelKey: FIELD_LABEL_KEYS[detail.field] })
  }
  return { code: error.message, documents: [], fields: [...fields.values()] }
}

/**
 * As chaves de texto para um código de erro, da mais específica à genérica: a mensagem da prévia, o motivo da
 * leitura da planilha (o mesmo código sobe no envio e na leitura), a mensagem comum do módulo e, por fim, a
 * genérica — o código cru nunca é a mensagem final.
 */
export function resolvePreviewErrorKeys(code: string): string[] {
  return [`preview.errors.${code}`, `preview.failure.${code}`, `errors.${code}`, 'errors.unknown']
}
