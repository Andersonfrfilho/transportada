/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF7: a prévia do e-mail do diálogo "Enviar à contratante". É montada por
 * `buildOccurrenceMail`, a mesma função do envio — a prévia é o e-mail que sai. Sem texto do
 * operador, parte do modelo do tipo (spec 271); sem modelo, começa em branco e o envio
 * fica bloqueado.
 */
import {
  loadCandidatesForDisplay,
  type MailCopyLogger,
} from '../../contractor-mail/application/resolve-mail-copy.service.js'
import {
  resolveEffectiveWatchers,
  type OccurrenceWatcherSource,
} from '../../contractor-mail/domain/occurrence-watcher.policy.js'
import { resolveMailSendReadiness } from '../../contractor-mail/domain/mail-send-readiness.policy.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { resolveOccurrenceRecipients } from '../domain/occurrence-contractor-recipients.policy.js'
import { OccurrenceMailTemplateMissingError } from '../domain/occurrence-conversation.error.js'
import { buildOccurrenceMail, type OccurrenceMail } from '../domain/occurrence-mail.template.js'
import { composeOccurrenceMailHtml } from '../domain/occurrence-mail-html-compose.policy.js'
import { htmlToPlainText } from '../domain/occurrence-mail-plain-text.policy.js'
import type { OccurrenceMailSigner } from '../domain/occurrence-mail-signer.policy.js'
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
 * Spec 183 T407: o destinatário como o diálogo mostra. `preselected` marca os destinatários escolhidos no tipo
 * (271, D13) ou, sem escolha, quem recebe ocorrências do grupo desta (RF5); o operador pode marcar qualquer um da lista, e o envio confere de novo.
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
  /** Spec 267/271: a lista efetiva (do tipo, da contratante ou da empresa); o operador só tira chips, nunca digita. */
  readonly cc: readonly OccurrenceMailCopyEntry[]
  /** `null` quando nenhuma lista tem responsável ativo. */
  readonly ccSource: OccurrenceWatcherSource | null
  /** O texto do operador (ou o do modelo), para o diálogo abrir preenchido. */
  readonly bodyText: string
  readonly contractorName: string
  /**
   * Spec 269 D8 / 271 D9: `true` quando o tipo não tem modelo utilizável no módulo de notificação — o envio fica
   * desabilitado no painel e a API o recusa (409). Calculado aqui; o painel não decide.
   */
  readonly missingNotificationTemplate: boolean
  readonly recipients: readonly OccurrenceMailRecipient[]
  /** `true` quando o texto veio do modelo, e não do operador. */
  readonly suggested: boolean
  /** A chave do modelo do tipo; o servidor o resolve também no envio, o cliente nunca o escolhe. */
  readonly notificationTemplateKey: null | string
}

export type PreviewOccurrenceMailUseCase = Readonly<{
  preview: (input: PreviewOccurrenceMailInput) => Promise<OccurrenceMailPreview>
}>

/**
 * A composição do modelo HTML para a prévia; `null` sem modelo HTML — e também quando o modelo não compõe (sem área ou
 * grande demais): aí o envio o recusa com o mesmo 409 e a prévia segue o caminho de texto.
 */
function composePreviewHtml(params: {
  readonly apiPublicUrl: string | undefined
  readonly appBaseUrl: string | undefined
  readonly bodyText: string | undefined
  readonly companyId: string
  readonly carrier: Parameters<typeof composeOccurrenceMailHtml>[0]['carrier']
  readonly contractorTaxId: null | string
  /** Como o envio: a faixa de resposta só existe quando o e-mail sai pelo Resend (com Reply-To). */
  readonly hasReplyTo: boolean
  readonly signer: OccurrenceMailSigner
  readonly source: Parameters<typeof composeOccurrenceMailHtml>[0]['source'] | null
}): ReturnType<typeof composeOccurrenceMailHtml> | null {
  if (params.source === null) return null
  try {
    return composeOccurrenceMailHtml({
      apiPublicUrl: params.apiPublicUrl,
      appBaseUrl: params.appBaseUrl,
      companyId: params.companyId,
      carrier: params.carrier,
      contractorTaxId: params.contractorTaxId,
      hasReplyTo: params.hasReplyTo,
      ...(params.bodyText === undefined ? {} : { operatorText: params.bodyText }),
      signer: params.signer,
      source: params.source,
    })
  } catch (error) {
    if (error instanceof OccurrenceMailTemplateMissingError) return null
    throw error
  }
}

export function createPreviewOccurrenceMailUseCase(dependencies: {
  readonly apiPublicUrl?: string
  /** Spec 272 (D5): a origem do painel, para as marcas do rodapé da prévia; ausente, o rodapé sai só em texto. */
  readonly appBaseUrl?: string
  readonly logger?: Pick<MailCopyLogger, 'warn'>
  readonly reader: Pick<
    OccurrenceMailTransactionPort,
    | 'findCarrierIdentity'
    | 'findChosenOccurrenceRecipientIds'
    | 'findMailSettings'
    | 'findOccurrenceMailHtmlSource'
    | 'findOccurrenceNotificationTemplate'
    | 'findOccurrenceTarget'
    | 'findOperatorSigner'
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

      const { contractorId } = target
      const template =
        contractorId === null
          ? null
          : await dependencies.reader.findOccurrenceNotificationTemplate({
              companyId,
              occurrenceId: input.occurrenceId,
            })
      const templateKey = template?.key ?? null
      const [carrier, operator, mailSettings] = await Promise.all([
        dependencies.reader.findCarrierIdentity({ companyId }),
        dependencies.reader.findOperatorSigner({ companyId, userId: input.actorUserId }),
        dependencies.reader.findMailSettings({ companyId }),
      ])
      const signer: OccurrenceMailSigner =
        operator === undefined
          ? { kind: 'team' }
          : {
              ...(operator.hasPicture === true ? { hasPicture: true } : {}),
              ...(operator.jobTitle === undefined ? {} : { jobTitle: operator.jobTitle }),
              kind: 'operator',
              name: operator.name,
              userId: input.actorUserId,
            }
      const typed = input.subject !== undefined || input.bodyText !== undefined
      /** Spec 272 (D12): modelo HTML → o `html` é o do modelo, e o texto do diálogo é o da área de mensagem. */
      const htmlSource =
        templateKey === null
          ? null
          : await dependencies.reader.findOccurrenceMailHtmlSource({
              companyId,
              occurrenceId: input.occurrenceId,
              templateKey,
            })
      const composed = composePreviewHtml({
        apiPublicUrl: dependencies.apiPublicUrl,
        appBaseUrl: dependencies.appBaseUrl,
        bodyText: input.bodyText,
        companyId,
        carrier,
        contractorTaxId: target.contractorTaxId,
        hasReplyTo: resolveMailSendReadiness({ settings: mailSettings }).ready,
        signer,
        source: htmlSource,
      })
      const suggestion =
        typed || templateKey === null || htmlSource !== null
          ? null
          : await dependencies.suggestedMail.readSuggestedMail({
              companyId,
              occurrenceId: input.occurrenceId,
              templateKey,
            })
      const subject = input.subject ?? composed?.subject ?? suggestion?.subject ?? ''
      const bodyText = input.bodyText ?? composed?.areaText ?? suggestion?.bodyText ?? ''

      const [candidates, watchers, chosenContactIds] = await Promise.all([
        contractorId === null
          ? []
          : dependencies.reader.listOccurrenceRecipients({ companyId, contractorId }),
        contractorId === null
          ? { company: [], contractor: [], type: [] }
          : loadCandidatesForDisplay({
              load: () =>
                dependencies.reader.loadWatcherCandidates({
                  companyId,
                  contractorId,
                  occurrenceTypeId: target.occurrenceTypeId,
                }),
              logger: dependencies.logger,
            }),
        contractorId === null || target.occurrenceTypeId === null
          ? []
          : dependencies.reader.findChosenOccurrenceRecipientIds({
              companyId,
              occurrenceTypeId: target.occurrenceTypeId,
            }),
      ])
      const preselected = new Set(
        resolveOccurrenceRecipients({
          chosenContactIds,
          contacts: candidates.map((candidate) => ({
            email: candidate.email,
            id: candidate.id,
            occurrenceStages: candidate.occurrenceStages,
          })),
          stage: target.stage,
        }).contactIds,
      )
      const copy = resolveEffectiveWatchers({
        companyWatchers: watchers.company,
        contractorWatchers: watchers.contractor,
        excludedUserIds: [],
        toAddresses: [],
        typeWatchers: watchers.type ?? [],
      })
      return {
        ...(composed === null
          ? buildOccurrenceMail({
              bodyText,
              carrierName: carrier?.displayName ?? '',
              operatorName: signer.kind === 'team' ? '' : signer.name,
              subject,
            })
          : {
              html: composed.html,
              subject: subject.trim(),
              text: htmlToPlainText(composed.html),
            }),
        bodyText,
        cc: copy.copy.map((entry) => ({
          maskedEmail: maskEmailAddress(entry.address),
          name: entry.name,
          userId: entry.userId,
        })),
        ccSource: copy.source,
        contractorName: target.contractorName,
        missingNotificationTemplate: templateKey === null,
        recipients: candidates.map((candidate) => ({
          approvesCharges: candidate.types.includes('approves_charges'),
          contactId: candidate.id,
          email: candidate.email,
          name: candidate.name,
          preselected: preselected.has(candidate.id),
          roleLabel: candidate.roleLabel,
        })),
        notificationTemplateKey: templateKey,
        suggested: suggestion !== null || (composed !== null && !typed),
      }
    },
  }
}
