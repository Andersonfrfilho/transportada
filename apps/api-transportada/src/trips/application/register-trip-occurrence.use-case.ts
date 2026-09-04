/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T020: registrar o que houve com um item da carga.
 */
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import { resolveOccurrenceProductScope } from '../domain/occurrence-scope.policy.js'
import { renderOccurrenceTemplate } from '../domain/occurrence-template.policy.js'
import type { OccurrenceTemplateValues } from '../domain/occurrence-template.policy.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'
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
  /** Vazio é a nota inteira — ver `occurrence-scope.policy.ts`. */
  readonly productCode: string
  readonly stage: TripOccurrenceStage
  /** O nome que a empresa deu ao tipo: é ele que a tela imprime, não um id. */
  readonly typeName: string
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
    readonly productCode: string
    readonly tripId: string
  }): Promise<OccurrenceTemplateValues>
  saveOccurrence(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly stage: TripOccurrenceStage
    readonly tripId: string
    readonly typeName: string
  }): Promise<null | TripOccurrence>
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

  /**
   * ⚠️ Produto fora da nota é **recusado**, nunca convertido em "nota inteira": apontar para item
   * que a nota não tem é engano de quem registrou, e silenciá-lo gravaria ocorrência sobre carga
   * que nunca esteve ali.
   */
  const scope = resolveOccurrenceProductScope({
    productCode,
    products: await repository.listDocumentProducts({ companyId, documentId, tripId }),
  })
  if (scope === null) throw new TripDocumentNotFoundError()

  const saved = await repository.saveOccurrence({
    actorUserId,
    companyId,
    documentId,
    note,
    occurrenceTypeId: occurrenceType.id,
    productCode: scope.productCode,
    stage: occurrenceType.stage,
    tripId,
    typeName: occurrenceType.name,
  })
  if (saved === null) throw new TripDocumentNotFoundError()

  await notifyOccurrence(input, occurrenceType)

  return { ...saved, email: await renderEmail({ input, occurrenceType, scope }) }
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
  readonly scope: { readonly productCode: string }
}): Promise<null | { readonly body: string; readonly subject: string }> {
  /** Com template do módulo, o aviso sai pelo trilho de notificação — não há e-mail a montar aqui. */
  if (params.occurrenceType.emailTemplateKey !== null) return null
  if (params.occurrenceType.emailSubject === '') return null

  const values = await params.input.repository.readTemplateValues({
    companyId: params.input.companyId,
    documentId: params.input.documentId,
    note: params.input.note,
    occurredOn: params.input.occurredOn,
    productCode: params.scope.productCode,
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
async function notifyOccurrence(
  input: RegisterTripOccurrenceInput,
  occurrenceType: OccurrenceTypeRecord,
): Promise<void> {
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
