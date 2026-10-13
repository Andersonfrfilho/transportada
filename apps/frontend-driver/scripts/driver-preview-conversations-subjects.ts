/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Assuntos que o motorista de demonstração pode abrir (spec 263 T3.3): as notas e as viagens que
 * `driver-preview-api.ts` serve em `/me/trips/current`, com os mesmos ids. Sem PII real.
 */
import type { PreviewSubjectType } from './driver-preview-conversations.types'

export type OpenablePreviewSubject = Readonly<{
  id: string
  label: string
  subjectType: PreviewSubjectType
}>

const PROTOCOL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const PROTOCOL_SUFFIX_LENGTH = 4

const DOCUMENT_RECIPIENTS = [
  'Mercearia do Centro',
  'Padaria Estrela',
  'Farmácia Bem Estar',
  'Supermercado Bom Preço',
  'Loja de Ferragens Silva',
  'Restaurante Sabor da Casa',
  'Atacadão Zona Norte',
] as const

const DOCUMENT_SUBJECTS: readonly OpenablePreviewSubject[] = DOCUMENT_RECIPIENTS.map(
  (recipient, index) => ({
    id: `00000000-0000-4000-8000-0000000002${String(index + 1).padStart(2, '0')}`,
    label: `NF ${900101 + index} · ${recipient}`,
    subjectType: 'document',
  }),
)

const TRIP_SUBJECTS: readonly OpenablePreviewSubject[] = [
  { id: '00000000-0000-4000-8000-000000000100', label: 'Viagem GCQ8E47', subjectType: 'trip' },
  { id: '00000000-0000-4000-8000-000000000300', label: 'Viagem FXY2B31', subjectType: 'trip' },
]

export const OPENABLE_PREVIEW_SUBJECTS: readonly OpenablePreviewSubject[] = [
  ...DOCUMENT_SUBJECTS,
  ...TRIP_SUBJECTS,
]

/** Alfabeto do protocolo real: sem 0, 1, I, L e O. */
export function randomProtocolSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PROTOCOL_SUFFIX_LENGTH))
  return Array.from(bytes, (byte) => PROTOCOL_ALPHABET[byte % PROTOCOL_ALPHABET.length]).join('')
}
