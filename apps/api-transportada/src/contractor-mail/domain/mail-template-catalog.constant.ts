/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 RF13/RF14: o catálogo fechado de tipos de e-mail e das variáveis de cada tipo. A
 * ocorrência (spec 143) entra depois, aqui, pelo mesmo cadastro. Sem import de propósito: o schema
 * do banco lê `CONTRACTOR_MAIL_TEMPLATE_TYPES` para a CHECK de `mail_type`.
 */

/** ⚠️ A ordem importa: o painel lê `catalog[0]` como o tipo de e-mail padrão — `occurrence` vai depois (spec 269). */
export const CONTRACTOR_MAIL_TEMPLATE_TYPES = ['address_correction', 'occurrence'] as const
export type ContractorMailTemplateType = (typeof CONTRACTOR_MAIL_TEMPLATE_TYPES)[number]

export const ADDRESS_CORRECTION_MAIL_TYPE: ContractorMailTemplateType = 'address_correction'
export const OCCURRENCE_MAIL_TYPE: ContractorMailTemplateType = 'occurrence'

/** RF15: arquivado, nunca apagado — a mensagem enviada aponta para o modelo que usou. */
export const CONTRACTOR_MAIL_TEMPLATE_STATUSES = ['active', 'archived'] as const
export type ContractorMailTemplateStatus = (typeof CONTRACTOR_MAIL_TEMPLATE_STATUSES)[number]

/** Tetos repetidos no schema HTTP e nas CHECKs do banco — a segunda trava contra escrita sem rota. */
export const CONTRACTOR_MAIL_TEMPLATE_LIMITS = {
  name: 120,
  subject: 200,
  text: 4000,
} as const

/**
 * Segurança L2 (revisão final da Fase 4): teto de modelos **ativos** por `(companyId, mailType)`.
 * Não é conta de negócio, é rede contra um cadastro em loop consumindo a tabela sem limite — 50
 * modelos ativos do mesmo tipo já é muito mais do que qualquer operação real usaria.
 */
export const CONTRACTOR_MAIL_TEMPLATE_MAX_ACTIVE = 50

/** Teto de `POST /contractor-mail-templates/preview` — em memória, por usuário, 60 por minuto. */
export const CONTRACTOR_MAIL_TEMPLATE_PREVIEW_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60_000,
} as const

export type MailTemplateVariable = {
  readonly description: string
  readonly name: string
}

export type MailTemplateContent = {
  readonly closing: string
  readonly intro: string
  readonly itemText: string
  readonly subject: string
}

export type MailTemplateCatalogEntry = {
  /** Variáveis do item: só no texto de cada item (`itemText`), que se repete por item enviado. */
  readonly itemVariables: readonly MailTemplateVariable[]
  readonly label: string
  /** Variáveis do e-mail: em assunto, abertura e assinatura (e também aceitas no item). */
  readonly mailVariables: readonly MailTemplateVariable[]
  /** O texto aprovado (`email-template.html`), oferecido como ponto de partida — nunca semeado. */
  readonly suggestedTemplate: MailTemplateContent & { readonly name: string }
}

/**
 * `{quantidade}` é só o número; `{clientes}` é o número com a palavra já no singular ou no plural
 * ("1 cliente", "3 clientes") — o assunto aprovado precisa da concordância, e um texto fixo não
 * sabe quantos itens vão no envio.
 */
export const MAIL_TEMPLATE_CATALOG: Readonly<
  Record<ContractorMailTemplateType, MailTemplateCatalogEntry>
> = {
  address_correction: {
    itemVariables: [
      { description: 'Nome do cliente da nota; sem nome, o endereço correto.', name: 'cliente' },
      { description: 'O endereço como veio na nota fiscal.', name: 'endereco_como_veio' },
      { description: 'O endereço correto, já conferido.', name: 'endereco_correto' },
      {
        description:
          'Por que o endereço precisa de correção: "endereço não localizado" ou "localizado a 3,2 km do endereço informado".',
        name: 'motivo',
      },
      { description: 'O CEP como veio na nota fiscal.', name: 'cep_como_veio' },
      { description: 'O CEP do endereço correto.', name: 'cep_correto' },
      { description: 'O município do endereço correto.', name: 'municipio' },
      { description: 'A UF do endereço correto.', name: 'uf' },
    ],
    label: 'Correção de endereço de entrega',
    mailVariables: [
      { description: 'Nome da contratante que recebe o e-mail.', name: 'contratante' },
      { description: 'Quantos endereços vão neste e-mail, só o número.', name: 'quantidade' },
      {
        description:
          'A quantidade com a palavra no singular ou no plural: "1 cliente", "3 clientes".',
        name: 'clientes',
      },
      { description: 'Nome da transportadora que envia o e-mail.', name: 'transportadora' },
      { description: 'Nome de quem está enviando o e-mail.', name: 'operador' },
    ],
    suggestedTemplate: {
      closing: 'Qualquer dúvida, é só responder este e-mail.\n\n{operador}\n{transportadora}',
      intro: [
        'Olá, equipe {contratante},',
        'Ao roteirizar as entregas das suas notas, não conseguimos localizar os endereços abaixo. Hoje a entrega aponta para o centro do município.',
        'Pedimos que confira e corrija o cadastro desses clientes no seu sistema, para que as próximas notas já saiam com o endereço certo.',
      ].join('\n\n'),
      itemText: 'Motivo: {motivo}.',
      name: 'Padrão',
      subject: 'Correção de endereço de entrega — {clientes}',
    },
  },
  /**
   * Spec 269 (ADR-0106): o e-mail da ocorrência. Sem `{operador}`/`{transportadora}`: a assinatura é
   * anexada por quem monta o e-mail, e o envio automático não tem operador. Os nomes de item ficam
   * no singular e os de e-mail que agregam itens no plural — o validador confere o item primeiro,
   * então o mesmo nome não pode existir nos dois níveis.
   */
  occurrence: {
    itemVariables: [
      { description: 'A descrição do item da nota.', name: 'item' },
      { description: 'O código do item.', name: 'codigo_item' },
      { description: 'A quantidade do item.', name: 'quantidade_item' },
      { description: 'A unidade do item.', name: 'unidade_item' },
      { description: 'O valor unitário do item, como veio na nota.', name: 'valor_unitario_item' },
      { description: 'A soma da linha do item (quantidade x valor unitário).', name: 'soma_item' },
      { description: 'O valor pago declarado para o item.', name: 'valor_item' },
    ],
    label: 'Ocorrência',
    mailVariables: [
      { description: 'Número da nota com série.', name: 'numero_nota' },
      { description: 'Número da nota sem série.', name: 'numero_nota_sem_serie' },
      { description: 'Razão social do destinatário da nota.', name: 'razao_social' },
      { description: 'Valor total da nota.', name: 'valor_nota' },
      { description: 'Nome da contratante.', name: 'contratante' },
      { description: 'Nome do motorista da viagem.', name: 'motorista' },
      { description: 'A parada da nota (sequência e cliente).', name: 'parada' },
      { description: 'Data da ocorrência.', name: 'data' },
      { description: 'Observação registrada.', name: 'observacao' },
      { description: 'Número do documento do cliente.', name: 'numero_referencia' },
      { description: 'Soma das linhas dos itens.', name: 'soma_itens' },
      { description: 'Valor pago declarado.', name: 'valor_declarado' },
      {
        description: 'Os itens da ocorrência num texto só, separados por vírgula.',
        name: 'itens',
      },
      { description: 'Os códigos dos itens, separados por vírgula.', name: 'codigos_itens' },
      {
        description: 'As quantidades dos itens, separadas por vírgula.',
        name: 'quantidades_itens',
      },
    ],
    suggestedTemplate: {
      closing: 'Qualquer dúvida, é só responder este e-mail.',
      intro:
        'Olá, equipe {contratante},\n\nRegistramos uma ocorrência na nota {numero_nota} ({razao_social}) em {data}.\n\n{observacao}',
      itemText: '{codigo_item} – {item} – {quantidade_item} {unidade_item} – R$ {valor_item}',
      name: 'Padrão',
      subject: 'Ocorrência na nota {numero_nota} — {contratante}',
    },
  },
}
