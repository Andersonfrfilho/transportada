/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: o texto que a empresa escreve para cada tipo de ocorrência.
 *
 * O e-mail ao embarcador hoje é escrito à mão a cada ocorrência, a partir de um documento de
 * modelos — e é lá que o número da nota entra trocado, o valor fica do pedido anterior e o assunto
 * sai fora do padrão que o SAC do cliente espera.
 */

/**
 * ⚠️ **Lista fechada, e é ela que a tela mostra a quem escreve o texto.** Marcador que o produto
 * não sabe preencher renderiza um buraco no e-mail do cliente — e quem recebe lê isso como defeito
 * do sistema, não como campo vazio.
 */
export const OCCURRENCE_TEMPLATE_PLACEHOLDERS = [
  'numeroNota',
  'razaoSocial',
  'valorNota',
  'contratante',
  'motorista',
  'parada',
  'data',
  'item',
  'codigoItem',
  'quantidadeItem',
  'observacao',
] as const

export type OccurrenceTemplatePlaceholder = (typeof OCCURRENCE_TEMPLATE_PLACEHOLDERS)[number]

export type OccurrenceTemplateValues = {
  /** O nome do embarcador — o "SPANI" do assunto dos modelos. */
  readonly contractorName: string
  readonly documentLabel: string
  readonly driverName: string
  /** Vazio na ocorrência da nota inteira: não há item a apontar. */
  readonly itemCode: string
  readonly itemLabel: string
  readonly itemQuantity: string
  /**
   * ⚠️ **O que o sistema não sabe entra por aqui.** Os modelos citam a NFD que a loja emitiu — um
   * número que nasce no balcão do cliente e não existe em lugar nenhum da nossa base. Quem
   * registra a ocorrência o digita, e o modelo o imprime por `{{observacao}}`.
   */
  readonly note: string
  readonly occurredOn: string
  readonly recipientName: string
  readonly stopLabel: string
  readonly totalValue: string
}

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/gu

function valueOf(placeholder: string, values: OccurrenceTemplateValues): null | string {
  switch (placeholder) {
    case 'codigoItem':
      return values.itemCode
    case 'contratante':
      return values.contractorName
    case 'data':
      return values.occurredOn
    case 'item':
      return values.itemLabel
    case 'motorista':
      return values.driverName
    case 'numeroNota':
      return values.documentLabel
    case 'observacao':
      return values.note
    case 'parada':
      return values.stopLabel
    case 'quantidadeItem':
      return values.itemQuantity
    case 'razaoSocial':
      return values.recipientName
    case 'valorNota':
      return values.totalValue
    default:
      return null
  }
}

/**
 * ⚠️ **Valor ausente vira vazio, nunca o marcador cru.** A nota nem sempre tem item apontado, e
 * imprimir `{{item}}` no e-mail do cliente é pior que imprimir nada.
 *
 * Espaço dentro das chaves é tolerado: é o erro de digitação mais comum de quem escreve o modelo, e
 * ele não pode custar um buraco no texto.
 */
export function renderOccurrenceTemplate(input: {
  readonly template: string
  readonly values: OccurrenceTemplateValues
}): string {
  return input.template.replace(PLACEHOLDER_PATTERN, (marcador, nome: string) => {
    const valor = valueOf(nome, input.values)
    return valor ?? marcador
  })
}

/**
 * ⚠️ **A recusa é no cadastro, não no envio.** Quem escreve o modelo erra o nome do marcador; se a
 * recusa viesse só na hora de enviar, o operador descobriria com o cliente esperando — e sem
 * recusa nenhuma o e-mail sairia com o marcador cru.
 */
export function unknownTemplatePlaceholders(template: string): readonly string[] {
  const conhecidos = new Set<string>(OCCURRENCE_TEMPLATE_PLACEHOLDERS)

  return [...template.matchAll(PLACEHOLDER_PATTERN)]
    .map((match) => match[1] ?? '')
    .filter((nome) => !conhecidos.has(nome))
}

/** Os itens que a ocorrência aponta, na ordem em que foram marcados. */
export type OccurrenceTemplateItem = {
  readonly code: string
  readonly description: string
  readonly quantity: number | string
}

/**
 * ⚠️ **O e-mail cita todos os itens marcados, não só o primeiro.** Uma caixa violada leva mais de
 * um item, e um texto que nomeia um só manda o cliente conferir a carga errada — e ele não teria
 * como saber que faltou item nenhum na descrição.
 *
 * Nota inteira continua imprimindo vazio nos três marcadores, nunca o marcador cru.
 */
export function buildOccurrenceItemValues(items: readonly OccurrenceTemplateItem[]): {
  readonly itemCode: string
  readonly itemLabel: string
  readonly itemQuantity: string
} {
  return {
    itemCode: items.map((item) => item.code).join(', '),
    itemLabel: items.map((item) => item.description).join(', '),
    itemQuantity: items.map((item) => String(item.quantity)).join(', '),
  }
}
