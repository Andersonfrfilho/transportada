/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CARGO_PREVIEW_ACCEPTED_EXTENSIONS, CARGO_PREVIEW_LIMITS } from './cargoPreview.constant'
import type { CargoFormIssue } from './cargoArrivalForm.validation'

export type PreviewUploadDraft = Readonly<{ contractorId: string; file: File | undefined }>

export type PreviewUploadFieldName = 'contractorId' | 'file'
export type PreviewUploadIssues = Partial<Record<PreviewUploadFieldName, CargoFormIssue>>

const BYTES_PER_KIB = 1024

function hasAcceptedExtension(fileName: string): boolean {
  const lowered = fileName.toLowerCase()
  return CARGO_PREVIEW_ACCEPTED_EXTENSIONS.some((extension) => lowered.endsWith(extension))
}

/**
 * Só se falha cedo aqui: o servidor confere os BYTES do arquivo (a extensão não é segurança) e o teto real é
 * o dele. O limite sai em KB, a unidade que o operador conhece, e o mesmo número vale para a mensagem.
 */
function validateFile(file: File | undefined): CargoFormIssue | undefined {
  if (file === undefined) return { code: 'required' }
  if (!hasAcceptedExtension(file.name)) return { code: 'extension' }
  if (file.size === 0) return { code: 'empty' }
  if (file.size > CARGO_PREVIEW_LIMITS.fileMaxBytes) {
    return { code: 'tooLarge', max: CARGO_PREVIEW_LIMITS.fileMaxBytes / BYTES_PER_KIB }
  }
  return undefined
}

/** Contratante e arquivo, todos os problemas de uma vez — nunca só o primeiro. */
export function validatePreviewUpload(draft: PreviewUploadDraft): PreviewUploadIssues {
  const entries: readonly (readonly [PreviewUploadFieldName, CargoFormIssue | undefined])[] = [
    ['contractorId', draft.contractorId === '' ? { code: 'required' } : undefined],
    ['file', validateFile(draft.file)],
  ]
  return Object.fromEntries(entries.filter(([, issue]) => issue !== undefined))
}

/**
 * A identidade do envio para a chave de idempotência: contratante e arquivo (nome, tamanho e data de
 * modificação, que o navegador entrega sem ler os bytes). O mesmo arquivo repetido tem a mesma impressão.
 */
export function buildPreviewUploadFingerprint(
  input: Readonly<{ contractorId: string; file: File }>,
): string {
  return JSON.stringify([
    input.contractorId,
    input.file.name,
    input.file.size,
    input.file.lastModified,
  ])
}
