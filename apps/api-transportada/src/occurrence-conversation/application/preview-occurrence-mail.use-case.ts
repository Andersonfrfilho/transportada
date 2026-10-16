/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF7: a prévia do e-mail do diálogo "Enviar à contratante". É montada por
 * `buildOccurrenceMail`, a mesma função do envio — a prévia é o e-mail que sai. Sem texto do
 * operador, parte do modelo do tipo da ocorrência (spec 079); tipo sem e-mail começa em branco.
 */
import { resolveEffectiveWatchers } from '../../contractor-mail/domain/occurrence-watcher.policy.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { buildOccurrenceMail, type OccurrenceMail } from '../domain/occurrence-mail.template.js'
import type {
  OccurrenceMailTransactionPort,
  OccurrenceSuggestedMailPort,
} from './occurrence-mail.port.js'

export type PreviewOccurrenceMailInput = {
  readonly actorUserId: string
  readonly bodyText?: string
  readonly companyId: string
  readonly occurrenceId: string
  readonly subject?: string
}

/**
 * Spec 183 T407: o destinatário como o diálogo mostra. `preselected` marca quem recebe ocorrências
 * do grupo desta (RF5); o operador pode marcar qualquer um da lista, e o envio confere de novo.
 */
export type OccurrenceMailRecipient = {
  readonly approvesCharges: boolean
  readonly contactId: string
  readonly email: string
  readonly name: string
  readonly preselected: boolean
  readonly roleLabel: string
}

/** Spec 267 RF4: um responsável em cópia como o diálogo mostra; o endereço real nunca sai da API. */
export type OccurrenceMailCopyEntry = {
  readonly maskedEmail: string
  readonly name: string
  readonly userId: string
}

export type OccurrenceMailPreview = OccurrenceMail & {
  /** Spec 267: a lista efetiva da contratante (ou da empresa); o operador só tira chips, nunca digita. */
  readonly cc: readonly OccurrenceMailCopyEntry[]
  /** `null` quando nenhuma lista tem responsável ativo. */
  readonly ccSource: 'company' | 'contractor' | null
  /** O texto do operador (ou o do modelo), para o diálogo abrir preenchido. */
  readonly bodyText: string
  readonly contractorName: string
  readonly recipients: readonly OccurrenceMailRecipient[]
  /** `true` quando o texto veio do modelo do tipo, e não do operador. */
  readonly suggested: boolean
}

export type PreviewOccurrenceMailUseCase = Readonly<{
  preview: (input: PreviewOccurrenceMailInput) => Promise<OccurrenceMailPreview>
}>

export function createPreviewOccurrenceMailUseCase(dependencies: {
  readonly reader: Pick<
    OccurrenceMailTransactionPort,
    | 'findCarrierName'
    | 'findOccurrenceTarget'
    | 'findOperatorName'
    | 'listOccurrenceRecipients'
    | 'loadWatcherCandidates'
  >
  readonly suggestedMail: OccurrenceSuggestedMailPort
}): PreviewOccurrenceMailUseCase {
  return {
    async preview(input) {
      const { companyId } = input
      const target = await dependencies.reader.findOccurrenceTarget({
        companyId,
        occurrenceId: input.occurrenceId,
      })
      if (target === null) throw new TripOccurrenceNotFoundError()

      const typed = input.subject !== undefined || input.bodyText !== undefined
      const suggestion = typed
        ? null
        : await dependencies.suggestedMail.readSuggestedMail({
            companyId,
            occurrenceId: input.occurrenceId,
          })
      const subject = input.subject ?? suggestion?.subject ?? ''
      const bodyText = input.bodyText ?? suggestion?.bodyText ?? ''

      const { contractorId } = target
      const [carrierName, operatorName, candidates, watchers] = await Promise.all([
        dependencies.reader.findCarrierName({ companyId }),
        dependencies.reader.findOperatorName({ companyId, userId: input.actorUserId }),
        contractorId === null
          ? []
          : dependencies.reader.listOccurrenceRecipients({ companyId, contractorId }),
        contractorId === null
          ? { company: [], contractor: [] }
          : dependencies.reader.loadWatcherCandidates({ companyId, contractorId }),
      ])
      const copy = resolveEffectiveWatchers({
        companyWatchers: watchers.company,
        contractorWatchers: watchers.contractor,
        excludedUserIds: [],
        toAddresses: [],
      })
      return {
        ...buildOccurrenceMail({
          bodyText,
          carrierName: carrierName ?? '',
          operatorName: operatorName ?? '',
          subject,
        }),
        bodyText,
        cc: copy.copy.map((entry) => ({
          maskedEmail: maskEmailAddress(entry.address),
          name: entry.name,
          userId: entry.userId,
        })),
        ccSource: copy.source,
        contractorName: target.contractorName,
        recipients: candidates.map((candidate) => ({
          approvesCharges: candidate.types.includes('approves_charges'),
          contactId: candidate.id,
          email: candidate.email,
          name: candidate.name,
          preselected: candidate.occurrenceStages.includes(target.stage),
          roleLabel: candidate.roleLabel,
        })),
        suggested: suggestion !== null,
      }
    },
  }
}
