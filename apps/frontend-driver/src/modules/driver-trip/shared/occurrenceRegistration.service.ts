/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverOccurrenceFlow,
  DriverOccurrenceType,
  DriverTripDocument,
  ProofFieldRequirement,
} from './driverTrip.types'
import {
  listMissingOccurrenceRequirements,
  resolveOccurrenceRequirements,
  type OccurrenceDraftFacts,
  type OccurrenceMissingField,
  type OccurrenceValuesFacts,
} from './occurrenceRequirements.service'

/**
 * Spec 218 (RF-A5, D1–D4): o botão único de ocorrência. A lista tem todos os tipos do catálogo,
 * de nota e de parada juntos; o motorista escolhe o tipo, e o `flow` dele decide a rota — nunca o
 * motorista. `attachmentMode` e `flow` chegam resolvidos pelo servidor: aqui só se lê.
 */

/** Ausente é a cópia guardada antes da spec 218, quando todo tipo era de nota. */
export function resolveOccurrenceFlow(type: DriverOccurrenceType): DriverOccurrenceFlow {
  return type.flow ?? 'document'
}

/** Spec 246: `photoMode` é o resolvido da nota; ausente é a API anterior — o `attachmentMode`, e sem ele, sem foto. */
export function resolveOccurrenceAttachmentMode(type: DriverOccurrenceType): ProofFieldRequirement {
  return resolveOccurrenceRequirements(type).photoMode
}

/**
 * Spec 218 RF-B2 (follow-up, substitui a spec 219): a lista final para o formulário do botão
 * único — os tipos de nota já resolvidos para **este** documento (contratante/destinatário do
 * emitente), mais os de parada da viagem inteira, que não têm um contratante/destinatário só para
 * resolver contra e continuam sem exceção. `document.occurrenceTypes === null` é cache antigo ou
 * falha na resolução do servidor — cai na lista da viagem inteira sem exceção, o comportamento de
 * antes da spec 218.
 *
 * ⚠️ A spec 219 resolvia isso mandando `contractorId`/`recipientTaxId` (CPF/CNPJ do destinatário)
 * como query string numa chamada à parte — violava security.md §3 ("nunca dado pessoal em URL").
 * Esta função lê o resultado já resolvido no servidor, embutido no snapshot; nenhum identificador
 * cru sai do aparelho.
 */
export function resolveOccurrenceTypesForDocument(input: {
  readonly document: DriverTripDocument
  readonly tripWideTypes: readonly DriverOccurrenceType[]
}): readonly DriverOccurrenceType[] {
  if (input.document.occurrenceTypes === null) return input.tripWideTypes
  return [
    ...input.document.occurrenceTypes,
    ...input.tripWideTypes.filter((type) => resolveOccurrenceFlow(type) === 'stop'),
  ]
}

/**
 * Spec 246 (RF7): o que o aparelho já tem em mãos. Fato não informado vale "nada capturado" — o
 * gate nunca presume o que ninguém conferiu.
 */
export type OccurrenceGateFacts = Readonly<{
  hasNote?: boolean
  hasPhoto: boolean
  hasProducts?: boolean
  hasSignature?: boolean
  /** Ausente é uma foto quando `hasPhoto`, nenhuma quando não. */
  photoCount?: number
  /** Spec 247: produtos marcados, número e valor pago; ausente é "nada digitado". */
  values?: OccurrenceValuesFacts
}>

function toDraftFacts(facts: OccurrenceGateFacts): OccurrenceDraftFacts {
  return {
    hasNote: facts.hasNote ?? false,
    hasProducts: facts.hasProducts ?? false,
    hasSignature: facts.hasSignature ?? false,
    photoCount: facts.photoCount ?? (facts.hasPhoto ? 1 : 0),
    ...(facts.values === undefined ? {} : { values: facts.values }),
  }
}

/**
 * Um gate só, com um plano por campo: foto (e o mínimo), observação, assinatura e produtos, cada
 * um no modo que o servidor resolveu para a nota. A parada segue só com a foto (D-d da 246).
 */
export function listMissingOccurrenceFields(
  input: OccurrenceGateFacts & { readonly type: DriverOccurrenceType },
): readonly OccurrenceMissingField[] {
  return listMissingOccurrenceRequirements({
    facts: toDraftFacts(input),
    requirements: resolveOccurrenceRequirements(input.type),
  })
}

/**
 * P5/P4: "Registrar" habilita com tudo o que é obrigatório **capturado no aparelho** — nada aqui
 * espera upload nem rede. A foto ainda sendo reduzida segura o botão: registrar sem ela a deixaria
 * para trás.
 */
export function canRegisterOccurrence(
  input: OccurrenceGateFacts & {
    readonly isPhotoReading: boolean
    readonly type: DriverOccurrenceType | undefined
  },
): boolean {
  if (input.type === undefined || input.isPhotoReading) return false
  return listMissingOccurrenceFields({ ...input, type: input.type }).length === 0
}
