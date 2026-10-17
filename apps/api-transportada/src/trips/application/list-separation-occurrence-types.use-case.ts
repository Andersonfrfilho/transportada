/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (ADR-0107, R6): os tipos que o galpão oferece **para uma nota** — ativos, do momento
 * `separation`, e só os que valem para a contratante da nota, lida pelo servidor. É a lista do
 * formulário de separação do painel (`trip.manage`); não carrega o texto do e-mail, o escopo nem as
 * contratantes do tipo, que são do cadastro (`settings.manage`).
 */
import { OCCURRENCE_MOMENT } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'
import { selectFieldOccurrenceTypes } from './list-field-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'

type SeparationOccurrenceTypeKey =
  | 'active'
  | 'allowsMultipleItems'
  | 'attachmentMode'
  | 'emailTemplateKey'
  | 'flow'
  | 'iconName'
  | 'id'
  | 'itemsMinimumCount'
  | 'itemsMode'
  | 'leavesDocumentBehind'
  | 'moments'
  | 'name'
  | 'noteMode'
  | 'notifies'
  | 'photoMinimumCount'
  | 'redeliveryPolicy'
  | 'signatureMode'
  | 'stage'

export type SeparationOccurrenceTypeView = {
  readonly [Key in SeparationOccurrenceTypeKey]: OccurrenceTypeRecord[Key] | undefined
}

export type ListSeparationOccurrenceTypesParams = {
  readonly companyId: string
  readonly documentId: string
  readonly repository: {
    findDocumentContractor(input: {
      readonly companyId: string
      readonly documentId: string
      readonly tripId: string
    }): Promise<null | { readonly contractorId: null | string }>
    listOccurrenceTypes(input: {
      readonly companyId: string
    }): Promise<readonly OccurrenceTypeRecord[]>
  }
  readonly tripId: string
}

/** A nota fora da viagem ou da empresa é 404 — o mesmo que o registro responde hoje. */
export async function listSeparationOccurrenceTypes(
  params: ListSeparationOccurrenceTypesParams,
): Promise<readonly SeparationOccurrenceTypeView[]> {
  const { companyId, documentId, repository, tripId } = params
  const subject = await repository.findDocumentContractor({ companyId, documentId, tripId })
  if (subject === null) throw new TripDocumentNotFoundError()

  const types = await repository.listOccurrenceTypes({ companyId })
  return selectFieldOccurrenceTypes({
    moment: OCCURRENCE_MOMENT.separation,
    noteContractorIds: [subject.contractorId],
    types,
  }).map(toSeparationOccurrenceTypeView)
}

function toSeparationOccurrenceTypeView(type: OccurrenceTypeRecord): SeparationOccurrenceTypeView {
  return {
    active: type.active,
    allowsMultipleItems: type.allowsMultipleItems,
    attachmentMode: type.attachmentMode,
    emailTemplateKey: type.emailTemplateKey,
    flow: type.flow,
    iconName: type.iconName,
    id: type.id,
    itemsMinimumCount: type.itemsMinimumCount,
    itemsMode: type.itemsMode,
    leavesDocumentBehind: type.leavesDocumentBehind,
    moments: type.moments,
    name: type.name,
    noteMode: type.noteMode,
    notifies: type.notifies,
    photoMinimumCount: type.photoMinimumCount,
    redeliveryPolicy: type.redeliveryPolicy,
    signatureMode: type.signatureMode,
    stage: type.stage,
  }
}
