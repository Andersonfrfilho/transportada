/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 (revisão): o tipo de ocorrência **seleciona** um template do módulo de notificações para o
 * aviso interno (quem despachou a viagem). Spec 247 (RF2): o e-mail à contratante é outro canal, com
 * assunto/corpo próprios — salvar um nunca apaga o outro.
 */
import {
  OccurrenceEmailTemplateNotFoundError,
  OccurrenceTypeLeavesDocumentBehindRequiresSeparationError,
} from '../domain/trip.error.js'
import {
  OCCURRENCE_CLIENT_CHANNEL_ORDER,
  type OccurrenceClientChannelMatrixChange,
} from '../domain/occurrence-client-channels.policy.js'
import {
  assessClientChannelTemplate,
  type ClientChannelTemplateContent,
} from '../domain/occurrence-client-channel-template.policy.js'
import { OccurrenceClientChannelTemplateInvalidError } from '../domain/occurrence-client-channels.error.js'
import type { OccurrenceClientChannel } from '../../shared/occurrence-client-channel.constant.js'
import type { RedeliveryPolicy } from '../../database/trip.schema.js'
import type {
  ClientChannel,
  ClientEmailSendMode,
  ClientEmailType,
} from '../../shared/delivery-client-email.constant.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import { OCCURRENCE_MOMENT, OCCURRENCE_TYPE_FLOWS } from '../../shared/trip-occurrence.constant.js'
import type {
  OccurrenceDeclaredAmountScope,
  OccurrenceMoment,
  OccurrenceTypeContractorScope,
  OccurrenceTypeFlow,
  OccurrenceTypeIconName,
  TripOccurrenceStage,
} from '../../shared/trip-occurrence.constant.js'
import { OccurrenceContractorTemplateInvalidError } from '../../occurrence-conversation/domain/occurrence-contractor-template.error.js'
import {
  assessContractorTemplate,
  type ContractorTemplateContent,
} from '../../occurrence-conversation/domain/occurrence-contractor-template.policy.js'
import { OccurrenceTypeContractorScopeInvalidError } from '../domain/occurrence-type-contractor-scope.error.js'
import {
  assertOccurrenceTypeContractorScopeIsWritable,
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE,
} from '../domain/occurrence-type-contractor-scope.policy.js'
import { assertDeclaredAmountHasItems } from '../domain/occurrence-declared-amount-shape.policy.js'
import {
  assertItemsMinimumMatchesMode,
  assertItemsOffHasNoRedeliveryPolicy,
} from '../domain/occurrence-items-shape.policy.js'
import { OccurrenceTypeMomentsStageConflictError } from '../domain/occurrence-moment.error.js'
import {
  assertOccurrenceMomentsAreWritable,
  deriveOccurrenceMomentsFromStageAndFlow,
  deriveStageAndFlowFromMoments,
  isExpressedByStageAndFlow,
  normalizeOccurrenceMoments,
} from '../domain/occurrence-moment.policy.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'
import type {
  ContractorReplyAlertMode,
  ContractorReplyAttachmentKind,
  ContractorReplyMode,
  ForwardToInformedEmailMode,
  ForwardToNoteRecipientMode,
  DuplicateRequestPolicy,
} from '../../shared/occurrence-contractor-reply.constant.js'

/** O catálogo de templates da empresa (módulo de notificação), visto pelo que este cadastro precisa dele. */
export type OccurrenceEmailTemplateCatalogPort = {
  /** Spec 271 (D1): a versão ativa mais alta (e-mail, pt-BR) da chave, da empresa; `null` quando não há. */
  findContractorTemplate(input: {
    readonly companyId: string
    readonly key: string
  }): Promise<ContractorTemplateContent | null>
  hasActiveEmailTemplate(input: {
    readonly companyId: string
    readonly templateKey: string
  }): Promise<boolean>
  /**
   * Spec 286 (RF2): a versão ativa mais alta da chave **no canal** (pt-BR), da empresa; `null` quando não há. Ausente
   * (dublê que não exercita a matriz) é "nenhum modelo": a chave mandada é recusada como `not_found`.
   */
  findClientChannelTemplate?(input: {
    readonly channel: OccurrenceClientChannel
    readonly companyId: string
    readonly key: string
  }): Promise<ClientChannelTemplateContent | null>
}

export type SaveOccurrenceTypeValues = {
  readonly active: boolean
  /** Spec 166 (RF3/RF9): se este tipo aceita mais de um item marcado. Ausente é "não mexa". */
  readonly allowsMultipleItems?: boolean | undefined
  /**
   * Spec 179 (RF1): se o registro do motorista exige comprovante. **Opcional de propósito**:
   * ausente quer dizer "não mexa", e não `'off'` — o editor do painel ainda não manda o campo, e
   * zerá-lo aqui desligaria a exigência de foto de um tipo `required` a cada edição de e-mail.
   */
  readonly attachmentMode?: DeliveryProofFieldMode | undefined
  /**
   * Spec 247 (RF1): o valor pago digitado — modo, escopo e rótulo. Ausente é "não mexa", nunca o
   * padrão da coluna (`off`), que desligaria o campo de um tipo configurado a cada edição de e-mail.
   */
  readonly declaredAmountLabel?: string | undefined
  readonly iconName?: null | OccurrenceTypeIconName | undefined
  readonly declaredAmountMode?: DeliveryProofFieldMode | undefined
  readonly declaredAmountScope?: OccurrenceDeclaredAmountScope | undefined
  /** Spec 248 (RF1): o retorno da contratante. Ausente é "não mexa" — nunca o padrão da coluna. */
  readonly contractorReplyAlertIntervalMinutes?: number | undefined
  readonly contractorReplyAlertMaxCount?: number | undefined
  readonly contractorReplyAlertMode?: ContractorReplyAlertMode | undefined
  readonly contractorReplyAttachmentKind?: ContractorReplyAttachmentKind | undefined
  readonly contractorReplyResolveOnDelivery?: boolean | undefined
  readonly duplicateRequestPolicy?: DuplicateRequestPolicy | undefined
  readonly driverLockMinutes?: null | number | undefined
  readonly clientEmailType?: ClientEmailType | undefined
  readonly clientEmailSendMode?: ClientEmailSendMode | undefined
  readonly clientChannel?: ClientChannel | undefined
  /** Spec 286 (RF2): a matriz por canal; canal ausente é "não mexa" e, presente, ela deriva `clientChannel`. */
  readonly clientChannels?: OccurrenceClientChannelMatrixChange | undefined
  readonly asksClientContact?: boolean | undefined
  readonly asksNewDueDate?: boolean | undefined
  readonly contractorReplyAcknowledgementQuickReplyId?: null | string | undefined
  readonly contractorReplyMode?: ContractorReplyMode | undefined
  readonly contractorReplyWaitHours?: null | number | undefined
  readonly driverReplyTemplate?: string | undefined
  readonly forwardToNoteRecipient?: ForwardToNoteRecipientMode | undefined
  readonly forwardToInformedEmail?: ForwardToInformedEmailMode | undefined
  readonly forwardEmailSubject?: string | undefined
  readonly forwardEmailBody?: string | undefined
  /** Spec 183 T802: ausente é "não mexa", como `attachmentMode`. */
  readonly emailsContractor?: boolean | undefined
  /**
   * Spec 271 (ADR-0108): a chave do modelo de e-mail do módulo de notificação que escreve o e-mail à contratante.
   * Ausente é "não mexa"; `null` limpa. Conferida **antes** da transação: sem trava, e o envio reconfere.
   */
  readonly contractorNotificationTemplateKey?: null | string | undefined
  /**
   * Spec 271 (D10): os responsáveis em cópia do e-mail à contratante, da lista da empresa (267). Ausente é
   * "não mexa"; `[]` limpa; vazio herda a lista da contratante e, depois, a da empresa.
   */
  readonly contractorMailWatcherUserIds?: readonly string[] | undefined
  /**
   * Spec 271 (D12): os destinatários do e-mail à contratante, contatos das contratantes da lista do tipo. Só em tipo
   * `listed`. Ausente é "não mexa"; `[]` limpa; vazio é o `To` automático da etapa.
   */
  readonly contractorMailRecipientContactIds?: readonly string[] | undefined
  /**
   * Spec 270 (ADR-0107): para quem o tipo vale. Escopo e lista vão **juntos** (um sem o outro é 400);
   * ausentes é "não mexa". `all` sem lista; `listed` com ao menos uma contratante da empresa.
   */
  readonly contractorIds?: readonly string[] | undefined
  readonly contractorScope?: OccurrenceTypeContractorScope | undefined
  readonly emailTemplateKey: null | string
  /**
   * Spec 218 (D1, RF-B5): qual dos dois caminhos de registro este tipo alimenta. Obrigatório na
   * criação (a fronteira já recusa `occurrenceTypeId: null` sem `flow`, ver `occurrence.schema.ts`);
   * ausente na edição é "não mexa", mesmo motivo de `attachmentMode`.
   */
  readonly flow?: OccurrenceTypeFlow | undefined
  /**
   * Spec 246 (RF1c2): a quantidade mínima de produtos, só com `itemsMode = 'required'`; `null` é
   * "todos os itens da nota". Ausente é "não mexa".
   */
  readonly itemsMinimumCount?: null | number | undefined
  /**
   * Spec 241 (RF4), spec 246 (RF1b): se o tipo carrega produtos. Ausente é "não mexa", como
   * `attachmentMode` — nunca `'optional'`, que religaria um tipo `off`.
   */
  readonly itemsMode?: DeliveryProofFieldMode | undefined
  /**
   * Spec 185 (RF6, ADR-0074 §4): só tipo de separação pode "deixar a nota para trás" —
   * `saveOccurrenceTypeWithTemplate` recusa `true` com `stage !== 'separation'` antes de gravar.
   * Ausente é "não mexa", nunca `false` — mesmo motivo de `attachmentMode` acima.
   */
  readonly leavesDocumentBehind?: boolean | undefined
  /**
   * Spec 246 (RF0, T1b.1b): o conjunto de momentos. Presente, `stage`/`flow` gravados são os
   * derivados dele; ausente é "não mexa" — na edição o caso de uso só re-deriva quando o par muda
   * num tipo que o par diz inteiro, e na criação vale o derivado de `stage`/`flow`.
   */
  readonly moments?: readonly OccurrenceMoment[] | undefined
  readonly name: string
  /** Spec 246 (RF1, RF3): a exigência da observação. Ausente é "não mexa" — nunca `'optional'`. */
  readonly noteMode?: DeliveryProofFieldMode | undefined
  readonly notifies: boolean
  readonly occurrenceTypeId: null | string
  /** Spec 246 (RF1c): a quantidade mínima de fotos (1..5), lida só com a foto `required`. Ausente é "não mexa". */
  readonly photoMinimumCount?: number | undefined
  /** Spec 247 (RF1): o número do documento do cliente — modo e rótulo. Ausente é "não mexa". */
  readonly referenceNumberLabel?: string | undefined
  readonly referenceNumberMode?: DeliveryProofFieldMode | undefined
  /** Ausente é "não mexa" (spec 164 RF1) — o valor guardado fica; na criação vale `'unset'`. */
  readonly redeliveryPolicy?: RedeliveryPolicy | undefined
  /** Spec 246 (RF1): a exigência da assinatura. Ausente é "não mexa" — nunca `'off'`. */
  readonly signatureMode?: DeliveryProofFieldMode | undefined
  readonly stage: TripOccurrenceStage
}

/**
 * O que o cadastro lê do tipo já gravado para validar o estado resultante (spec 241 RF11) e decidir
 * o conjunto de momentos (spec 246 T1b.1b). `stage` ausente é dublê de teste: sem ele não há troca
 * de par para conferir.
 */
export type CurrentOccurrenceTypeShape = Partial<
  Pick<
    OccurrenceTypeRecord,
    | 'contractorScope'
    | 'declaredAmountMode'
    | 'declaredAmountScope'
    | 'flow'
    | 'itemsMinimumCount'
    | 'moments'
    | 'stage'
  >
> &
  Pick<OccurrenceTypeRecord, 'itemsMode' | 'redeliveryPolicy'>

export type SaveOccurrenceTypeWithTemplateInput = {
  readonly companyId: string
  readonly findCurrentType: (input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }) => Promise<CurrentOccurrenceTypeShape | null>
  readonly save: (values: SaveOccurrenceTypeValues) => Promise<OccurrenceTypeRecord>
  readonly templates: OccurrenceEmailTemplateCatalogPort
  readonly values: SaveOccurrenceTypeValues
}

/**
 * ⚠️ **Chave presente é validada na gravação**, não no envio: descobrir o template inexistente
 * quando a ocorrência acontecer seria descobrir com o aviso já perdido. A chave é do aviso interno;
 * assunto e corpo são o e-mail à contratante e **seguem gravados como vieram** (spec 247 RF2) — zerá-los
 * aqui apagava, sem erro, o e-mail que o aviso automático (183) manda.
 */
export async function saveOccurrenceTypeWithTemplate(
  input: SaveOccurrenceTypeWithTemplateInput,
): Promise<OccurrenceTypeRecord> {
  const stored = await readStoredTypeWhenNeeded(input)
  const values = resolveMomentsChange({ stored, values: input.values })
  if (values.leavesDocumentBehind === true && values.stage !== 'separation') {
    throw new OccurrenceTypeLeavesDocumentBehindRequiresSeparationError()
  }

  assertItemsOffHasNoRedeliveryPolicy({ stored, values })
  assertItemsMinimumMatchesMode({ stored, values })
  assertDeclaredAmountHasItems({ stored, values })
  assertContractorScopeValues(values)
  await assertContractorTemplateIsUsable({
    companyId: input.companyId,
    templates: input.templates,
    values,
  })

  await assertClientChannelTemplatesAreUsable({
    companyId: input.companyId,
    templates: input.templates,
    values,
  })

  const { emailTemplateKey } = values
  if (emailTemplateKey === null) return input.save(values)

  const exists = await input.templates.hasActiveEmailTemplate({
    companyId: input.companyId,
    templateKey: emailTemplateKey,
  })
  if (!exists) throw new OccurrenceEmailTemplateNotFoundError()

  return input.save(values)
}

/** Spec 271 (D5): chave presente é conferida na gravação — todos os problemas de uma vez, nunca o primeiro só. */
async function assertContractorTemplateIsUsable(params: {
  readonly companyId: string
  readonly templates: OccurrenceEmailTemplateCatalogPort
  readonly values: SaveOccurrenceTypeValues
}): Promise<void> {
  const key = params.values.contractorNotificationTemplateKey
  if (key === undefined || key === null) return
  const template = await params.templates.findContractorTemplate({
    companyId: params.companyId,
    key,
  })
  const problems = assessContractorTemplate({ key, template })
  if (problems.length > 0) throw new OccurrenceContractorTemplateInvalidError(problems)
}

/**
 * Spec 286 (RF2): cada canal mandado com chave tem de apontar para um modelo utilizável do módulo naquele canal — todos
 * os problemas de todos os canais de uma vez. Chave nula é permitida (o canal fica sem modelo e não sai; o editor avisa).
 */
async function assertClientChannelTemplatesAreUsable(params: {
  readonly companyId: string
  readonly templates: OccurrenceEmailTemplateCatalogPort
  readonly values: SaveOccurrenceTypeValues
}): Promise<void> {
  const change = params.values.clientChannels
  if (change === undefined) return
  const checks = await Promise.all(
    OCCURRENCE_CLIENT_CHANNEL_ORDER.map(async (channel) => {
      const key = change[channel]?.templateKey
      if (key === undefined || key === null) return { channel, problems: [] }
      const template =
        (await params.templates.findClientChannelTemplate?.({
          channel,
          companyId: params.companyId,
          key,
        })) ?? null
      return { channel, problems: assessClientChannelTemplate({ channel, key, template }) }
    }),
  )
  const invalid = checks.filter((check) => check.problems.length > 0)
  if (invalid.length > 0) throw new OccurrenceClientChannelTemplateInvalidError(invalid)
}

/** Uma leitura só do gravado, e só na edição que deixa algum campo ausente. */
async function readStoredTypeWhenNeeded(
  input: SaveOccurrenceTypeWithTemplateInput,
): Promise<CurrentOccurrenceTypeShape | null> {
  const {
    declaredAmountMode,
    declaredAmountScope,
    itemsMinimumCount,
    itemsMode,
    moments,
    occurrenceTypeId,
    redeliveryPolicy,
  } = input.values
  const isStoredStateNeeded =
    occurrenceTypeId !== null &&
    (itemsMode === undefined ||
      declaredAmountMode === undefined ||
      declaredAmountScope === undefined ||
      itemsMinimumCount === undefined ||
      redeliveryPolicy === undefined ||
      moments === undefined)
  return isStoredStateNeeded
    ? input.findCurrentType({ companyId: input.companyId, occurrenceTypeId })
    : null
}

type ResolveMomentsChangeParams = {
  readonly stored: CurrentOccurrenceTypeShape | null
  readonly values: SaveOccurrenceTypeValues
}

/**
 * Spec 246 (T1b.1b): com `moments`, o par gravado é o derivado do conjunto. Sem `moments`, o gravado
 * fica — salvo quando o `PUT` muda `stage`/`flow`: tipo que o par diz inteiro re-deriva o conjunto
 * (o painel de hoje troca `flow` assim); tipo com vários momentos é 409, nunca perda calada.
 */
function resolveMomentsChange(params: ResolveMomentsChangeParams): SaveOccurrenceTypeValues {
  const { stored, values } = params
  if (values.moments !== undefined) {
    const moments = normalizeOccurrenceMoments(values.moments)
    assertOccurrenceMomentsAreWritable(moments)
    return { ...values, ...deriveStageAndFlowFromMoments(moments), moments }
  }
  if (values.occurrenceTypeId === null || stored?.stage === undefined) return values

  const storedPair = { flow: stored.flow ?? OCCURRENCE_TYPE_FLOWS.document, stage: stored.stage }
  const nextPair = { flow: values.flow ?? storedPair.flow, stage: values.stage }
  if (nextPair.stage === storedPair.stage && nextPair.flow === storedPair.flow) return values
  if (!isExpressedByStageAndFlow({ ...storedPair, moments: stored.moments })) {
    throw new OccurrenceTypeMomentsStageConflictError()
  }
  return { ...values, moments: deriveOccurrenceMomentsFromStageAndFlow(nextPair) }
}

/**
 * Spec 270 (D7): escopo e lista vão juntos; o par completo é validado com os momentos que vierem. O que
 * depende do gravado (momentos só de parada num tipo já `listed`) é conferido na transação da gravação.
 */
function assertContractorScopeValues(values: SaveOccurrenceTypeValues): void {
  const { contractorIds, contractorScope } = values
  if (contractorScope === undefined && contractorIds === undefined) return
  if (contractorScope === undefined || contractorIds === undefined) {
    throw new OccurrenceTypeContractorScopeInvalidError([
      {
        field: contractorScope === undefined ? 'contractorScope' : 'contractorIds',
        message: OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.listNotAllowed,
      },
    ])
  }
  assertOccurrenceTypeContractorScopeIsWritable({
    contractorIds,
    moments: values.moments ?? [OCCURRENCE_MOMENT.document],
    scope: contractorScope,
  })
}
