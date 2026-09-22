/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T020: registrar o que houve com um item da carga.
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import type { RedeliveryPolicy } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import type { OccurrenceAttachmentView } from './occurrence-attachment.service.js'
import { resolveOccurrenceProductSelection } from '../domain/occurrence-scope.policy.js'
import { renderOccurrenceTemplate } from '../domain/occurrence-template.policy.js'
import type { OccurrenceTemplateValues } from '../domain/occurrence-template.policy.js'
import {
  OccurrencePhotoRequiredError,
  OccurrenceTypeNotSeparationError,
  TripDocumentNotFoundError,
} from '../domain/trip.error.js'
import { resolveOccurrenceNotification } from '../domain/occurrence-notification.policy.js'
import type {
  OccurrenceNotificationParameters,
  OccurrenceNotificationSetting,
} from '../domain/occurrence-notification.policy.js'

export type TripOccurrence = {
  readonly createdAt: string
  readonly id: string
  readonly note: string
  readonly occurrenceTypeId: string
  /**
   * Vazio é a nota inteira — ver `occurrence-scope.policy.ts`. Com vários itens marcados, é o
   * **primeiro** deles: a coluna continua existindo e continua sendo escrita, porque ocorrência
   * antiga e o fluxo do WhatsApp leem dela.
   */
  readonly productCode: string
  readonly stage: TripOccurrenceStage
  /** O nome que a empresa deu ao tipo: é ele que a tela imprime, não um id. */
  readonly typeName: string
}

/**
 * Spec 156 T9 (D3): quem registrou e em nome de quem — só nomes, nunca CPF/e-mail/telefone
 * (D11). `actorName`/`onBehalfOfDriverName` são `null` quando o usuário ou o motorista não têm
 * mais vínculo ativo na empresa (nome não resolvido, id nunca vaza).
 */
export type TripOccurrenceAuthorship = {
  readonly channel: TripFieldChannel
  readonly actorName: string | null
  readonly onBehalfOfDriverName: string | null
}

/**
 * Spec 161 T9 (RF8/RF9): sai o `attachment` singular — o painel da nota devolve `attachments[]`
 * ordenado por `position`, no mesmo formato que a leitura unificada (`occurrence-attachment.service.ts`,
 * T3) já publica para o feed e para a rota de anexos: `downloadUrl`/`thumbnailUrl` assinados,
 * `expired`, nunca `objectKey`/`bucket`.
 */
export type TripOccurrenceWithAttachment = TripOccurrence &
  TripOccurrenceAuthorship & {
    readonly attachments: readonly OccurrenceAttachmentView[]
    /** Todos os itens apontados; `productCode` continua sendo o primeiro deles. */
    readonly productCodes: readonly string[]
  }

/**
 * O que o **registro** devolve: a ocorrência mais o e-mail pronto.
 *
 * ⚠️ O e-mail não entra em `TripOccurrence` porque a **listagem** não o tem — e não deveria ter:
 * renderizar o modelo de toda ocorrência passada seria trabalho por nada, e o texto de meses atrás
 * sairia com os dados de hoje.
 *
 * ⚠️ Ele volta **para o operador conferir e enviar**, não para o sistema enviar: o destinatário é
 * externo, e mandar e-mail em nome da transportadora é decisão que ainda não foi tomada. Devolver
 * o texto pronto já tira o retrabalho de escrever à mão.
 */
export type RegisteredOccurrence = TripOccurrence & {
  /**
   * Todos os itens marcados, na ordem em que foram marcados. Vazia é a nota inteira. Vem ao lado
   * de `productCode` (o primeiro deles), que continua existindo para quem já lia dele.
   */
  readonly productCodes: readonly string[]
  /** Spec 161 T6 (RF5): `[]` quando `saveOccurrence` não devolveu anexo (não deveria acontecer
   * para `separation`, já que D1 exige foto — mas a leitura fica defensiva, nunca `undefined`). */
  readonly attachments: readonly TripOccurrenceAttachmentPosition[]
  readonly email: null | { readonly body: string; readonly subject: string }
}

/** O tipo cadastrado, como o caso de uso precisa vê-lo para decidir. */
export type OccurrenceTypeRecord = {
  readonly active: boolean
  /** Vazio é tipo que não gera e-mail: nem toda ocorrência precisa avisar o embarcador. */
  readonly emailBody: string
  readonly emailSubject: string
  /** A chave do template do módulo de notificações; nula é o legado (assunto/corpo próprios). */
  readonly emailTemplateKey: null | string
  readonly id: string
  readonly name: string
  readonly notifies: boolean
  /**
   * Spec 164 T4 (RF3): decide se o registro abre uma tratativa (`trip_occurrence_cases`).
   * Ausente é tratado como `'unset'` — não abre; existe como opcional só para os dublês de teste
   * que ainda não conhecem a tratativa (`findOccurrenceType`, a implementação real, sempre grava).
   */
  readonly redeliveryPolicy?: RedeliveryPolicy
  readonly stage: TripOccurrenceStage
}

export type TripOccurrencePort = {
  listOccurrences(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly TripOccurrence[]>
  /** `null` quando a nota não é desta viagem nesta empresa — ausência, nunca escrita às cegas. */
  /** `null` quando o tipo não é desta empresa, ou foi aposentado. */
  findOccurrenceType(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<null | OccurrenceTypeRecord>
  listDocumentProducts(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly { readonly code: string; readonly description: string }[]>
  readTemplateValues(input: {
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurredOn: string
    readonly productCodes: readonly string[]
    readonly tripId: string
  }): Promise<OccurrenceTemplateValues>
  saveOccurrence(input: {
    readonly actorUserId: string
    /**
     * Spec 161 T6: já validado (teto/tipo/assinatura) — a implementação sobe o original e a
     * miniatura opcional e grava a linha em `trip_document_occurrence_attachments`, tudo na mesma
     * transação da ocorrência.
     */
    readonly attachment: {
      readonly bytes: Uint8Array
      readonly mimeType: string
      readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
    }
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly productCodes: readonly string[]
    /** Spec 164 T4 (RF3): repassada ao escritor da ocorrência, que abre a tratativa dentro da mesma transação. */
    readonly redeliveryPolicy?: RedeliveryPolicy
    readonly stage: TripOccurrenceStage
    readonly tripId: string
    readonly typeName: string
  }): Promise<
    null | (TripOccurrence & { readonly attachments?: readonly TripOccurrenceAttachmentPosition[] })
  >
}

/** O que `saveOccurrence` devolve para a foto gravada — só `id`/`position`, sem URL (D5). */
export type TripOccurrenceAttachmentPosition = {
  readonly id: string
  readonly position: number
}

/**
 * O aviso é **efeito de borda do registro**, e falhar nele não desfaz a ocorrência: a ocorrência é
 * o fato, e o aviso é conveniência. Perder o registro porque a fila caiu seria trocar o dado pelo
 * recado.
 */
export type OccurrenceNotifierPort = {
  notify(input: {
    readonly companyId: string
    readonly parameters: OccurrenceNotificationParameters
    readonly templateKey: string
  }): Promise<void>
}

export type RegisterTripOccurrenceInput = {
  readonly actorUserId: string
  /**
   * Spec 161 D1/RF4: a foto da ocorrência de galpão. Ausente é aceitável para o **tipo**, mas não
   * para a **etapa** — `separation` recusa sem ela (`OccurrencePhotoRequiredError`), antes de
   * `saveOccurrence`, do storage e da auditoria. Spec 161 T6: o original e a miniatura opcional
   * (D12/D14) só são validados (teto/tipo/assinatura) e persistidos dentro de `saveOccurrence` — a
   * implementação da rota faz isso antes de abrir a transação (`persist-separation-occurrence-
   * attachment.service.ts`); este caso de uso só confere presença, nunca bytes.
   */
  readonly attachment?: {
    readonly bytes: Uint8Array
    readonly mimeType: string
    readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
  }
  readonly companyId: string
  readonly documentId: string
  readonly note: string
  /** A data que o modelo imprime. Vem de fora para o caso de uso continuar puro. */
  readonly occurredOn: string
  /** Ausente quando a instalação não tem trilho de notificação — o registro segue igual. */
  readonly notifier?: OccurrenceNotifierPort
  readonly notificationParameters?: OccurrenceNotificationParameters
  readonly notificationSettings?: readonly OccurrenceNotificationSetting[]
  readonly productCode: string
  /**
   * Os itens que a tela marcou. Ausente ou vazia com `productCode` preenchido é o contrato antigo;
   * os dois preenchidos é 422 — ver `resolveOccurrenceProductSelection`.
   */
  readonly productCodes?: readonly string[]
  readonly repository: TripOccurrencePort
  readonly tripId: string
  readonly occurrenceTypeId: string
}

/**
 * ⚠️ **Só anota.** Não muda `separation_status`, não bloqueia transição, não impede despacho.
 * Misturar o estado da nota com o que houve com ela deixaria o operador sem saída, porque não
 * existe tela de resolução de ocorrência — e a nota ficaria travada num estado que ninguém sabe
 * destravar. Quando essa tela existir, o bloqueio é decisão nova, por escrito.
 *
 * O grupo é **derivado do tipo**, nunca aceito do cliente: aceitá-lo no corpo deixaria quem tem
 * `trip.manage` declarar que uma ocorrência de rua é de galpão para caber na própria permissão.
 */
export async function registerTripOccurrence(
  input: RegisterTripOccurrenceInput,
): Promise<RegisteredOccurrence> {
  const { actorUserId, companyId, documentId, note, productCode, repository, tripId } = input

  /**
   * ⚠️ **O tipo é conferido contra o cadastro da empresa**, e não contra uma lista em código. Tipo
   * de outra empresa e tipo aposentado respondem igual — inalcançável —, porque distinguir os dois
   * diria a quem tenta se aquele identificador existe em algum lugar.
   */
  const occurrenceType = await repository.findOccurrenceType({
    companyId,
    occurrenceTypeId: input.occurrenceTypeId,
  })
  if (occurrenceType === null || !occurrenceType.active) throw new TripDocumentNotFoundError()

  /** Spec 157: a ocorrência de rua tem rota própria — a do motorista e a do escritório em nome dele. */
  if (occurrenceType.stage !== TRIP_OCCURRENCE_STAGE.separation) {
    throw new OccurrenceTypeNotSeparationError()
  }

  /**
   * ⚠️ Spec 161 D1/RF4: a foto passa a ser obrigatória **aqui**, no caso de uso, e não na rota
   * HTTP — a fase 4 desta spec faz o WhatsApp registrar pelo mesmo caminho, e a regra na rota
   * deixaria o outro canal passar por fora. A recusa é **antes** de ler produtos, de
   * `saveOccurrence`, do storage e da auditoria: nenhum efeito de borda acontece para uma
   * ocorrência que não vai nascer.
   */
  if (input.attachment === undefined) throw new OccurrencePhotoRequiredError()
  const attachment = input.attachment

  /**
   * ⚠️ Produto fora da nota é **recusado**, nunca convertido em "nota inteira": apontar para item
   * que a nota não tem é engano de quem registrou, e silenciá-lo gravaria ocorrência sobre carga
   * que nunca esteve ali. Item repetido e os dois campos juntos são recusados pelo mesmo caminho.
   */
  const scope = resolveOccurrenceProductSelection({
    productCode,
    productCodes: input.productCodes,
    products: await repository.listDocumentProducts({ companyId, documentId, tripId }),
  })

  const saved = await repository.saveOccurrence({
    actorUserId,
    attachment,
    companyId,
    documentId,
    note,
    occurrenceTypeId: occurrenceType.id,
    productCode: scope.productCode,
    productCodes: scope.productCodes,
    ...(occurrenceType.redeliveryPolicy === undefined
      ? {}
      : { redeliveryPolicy: occurrenceType.redeliveryPolicy }),
    stage: occurrenceType.stage,
    tripId,
    typeName: occurrenceType.name,
  })
  if (saved === null) throw new TripDocumentNotFoundError()

  await notifyOccurrence({
    companyId,
    notificationParameters: input.notificationParameters,
    notifier: input.notifier,
    occurrenceType,
  })

  return {
    ...saved,
    attachments: saved.attachments ?? [],
    email: await renderEmail({ input, occurrenceType, scope }),
    productCodes: scope.productCodes,
  }
}

/**
 * ⚠️ **Assunto vazio é tipo sem e-mail**, e a checagem é no assunto: um corpo sem assunto sairia
 * como mensagem sem título, e um assunto sem corpo ainda é um e-mail útil.
 *
 * Os valores são lidos **depois** de o registro existir, e de propósito: se a leitura falhar, a
 * ocorrência já está gravada e o operador perde o texto pronto, não o registro.
 */
async function renderEmail(params: {
  readonly input: RegisterTripOccurrenceInput
  readonly occurrenceType: OccurrenceTypeRecord
  readonly scope: { readonly productCodes: readonly string[] }
}): Promise<null | { readonly body: string; readonly subject: string }> {
  /** Com template do módulo, o aviso sai pelo trilho de notificação — não há e-mail a montar aqui. */
  if (params.occurrenceType.emailTemplateKey !== null) return null
  if (params.occurrenceType.emailSubject === '') return null

  const values = await params.input.repository.readTemplateValues({
    companyId: params.input.companyId,
    documentId: params.input.documentId,
    note: params.input.note,
    occurredOn: params.input.occurredOn,
    productCodes: params.scope.productCodes,
    tripId: params.input.tripId,
  })

  return {
    body: renderOccurrenceTemplate({ template: params.occurrenceType.emailBody, values }),
    subject: renderOccurrenceTemplate({ template: params.occurrenceType.emailSubject, values }),
  }
}

/**
 * ⚠️ **O aviso nunca derruba o registro.** A ocorrência é o fato; o aviso é conveniência. Uma fila
 * fora do ar não pode fazer o operador perder o que ele acabou de registrar — e ele não teria como
 * saber que perdeu, porque a tela mostraria erro sobre uma escrita que aconteceu.
 *
 * O padrão continua sendo **não avisar**: sem notificador, sem parâmetros ou sem a flag ligada para
 * aquele tipo, nada sai.
 */
export type NotifyOccurrenceParams = {
  readonly companyId: string
  readonly notificationParameters: OccurrenceNotificationParameters | undefined
  readonly notifier: OccurrenceNotifierPort | undefined
  readonly occurrenceType: OccurrenceTypeRecord
}

/** Spec 156 T7.3: exportada para o lote do escritório avisar por nota com a mesma regra. */
export async function notifyOccurrence(input: NotifyOccurrenceParams): Promise<void> {
  const { occurrenceType } = input
  if (input.notifier === undefined || input.notificationParameters === undefined) return

  /**
   * A flag mora **no próprio tipo** desde 2026-09-03: eram a mesma decisão chaveada pelo mesmo
   * valor, e a tabela ao lado obrigava a tela a casar duas listas para mostrar uma.
   */
  const notification = resolveOccurrenceNotification({
    parameters: { ...input.notificationParameters, occurrenceType: occurrenceType.name },
    settings: [{ notifies: occurrenceType.notifies, type: occurrenceType.id }],
    /** Tipo com chave avisa pelo template do módulo que ele selecionou; sem chave, o legado. */
    ...(occurrenceType.emailTemplateKey === null
      ? {}
      : { templateKey: occurrenceType.emailTemplateKey }),
    type: occurrenceType.id,
  })
  if (notification === null) return

  try {
    await input.notifier.notify({
      companyId: input.companyId,
      parameters: notification.parameters,
      templateKey: notification.templateKey,
    })
  } catch {
    // Engolido de propósito: ver o comentário acima.
  }
}
