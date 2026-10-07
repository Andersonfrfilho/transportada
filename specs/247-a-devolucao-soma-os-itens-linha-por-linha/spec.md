# Feature 247 — A devolução soma os itens linha por linha e registra o valor pago por avaria

## Problema e resultado

O SAC de uma contratante mandou à transportadora o padrão de e-mail que ela exige para três
ocorrências: **devolução parcial**, **devolução total** e **prorrogação de boleto** (arquivo
`Template de ocorrências.md`, recebido do usuário em 2026-10-06). A prorrogação é da
[spec 248](../248-a-prorrogacao-do-boleto-vai-direto-a-contratante/spec.md). Esta spec trata as duas
devoluções.

O e-mail de devolução parcial que o SAC exige tem quatro coisas que o produto não consegue escrever
hoje:

```text
Assunto: OCORRÊNCIA: SPANI – NF 680481 – DEVOLUÇÃO PARCIAL

Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.

NFD 45029 – R$ 57,20
RAZÃO SOCIAL: SUPERMERCADO TRIALBA LTDA
NOTA FISCAL: 680481
VALOR DA ENTREGA: R$ 7.840,64

2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO – 01FD – Avaria identificada no momento da conferência das mercadorias
```

1. **Uma linha por item.** `buildOccurrenceItemValues` junta cada campo separadamente com vírgula
   (`occurrence-template.policy.ts:134-136`): duas linhas devolvidas saem como `código A, código B` e
   `descrição A, descrição B`, sem como montar "uma linha por produto".
2. **A soma.** Não existe marcador de valor por item, de soma da linha nem de soma geral. E o
   `{{quantidadeItem}}` imprime a quantidade **da linha da NF-e**, não a devolvida
   (`delivery-proof-read.support.ts:336-342` lê `nfeProducts.quantity`) — num e-mail de devolução
   parcial isso é o número errado.
3. **O número da NFD.** Nasce no balcão do cliente; não existe em lugar nenhum da base.
4. **O valor pago pela avaria.** Quando a loja devolve com valor diferente do da nota (desconto,
   parte da caixa), quem está lá precisa **digitar** o valor. Hoje não há campo para isso no registro;
   o único valor por item da base é o do acerto da tratativa (spec 164), que só existe **depois** da
   decisão `goods_paid`.

E dois defeitos de leitura que o texto do SAC expõe: `{{valorNota}}` imprime o `numeric` cru
(`7840.6400`, `delivery-proof-read.support.ts:1306`), e o painel não deixa editar o modelo de e-mail
que vai à contratante (ver "Achados no código").

Ao fim: o operador configura, **na aba Tipos de `/ocorrencias`**, um tipo que pede os produtos com a
quantidade devolvida, o número do documento do cliente (rotulado como ele quiser — "Número da NFD") e
o valor pago, e escreve ali mesmo o assunto, o corpo e o **formato da linha de item**, vendo a prévia.
Quem registra (motorista no app ou operador na correção) marca os itens, a quantidade, vê a soma de
cada linha e a soma geral, digita o valor pago quando ele difere, e o e-mail à contratante sai no
padrão do SAC.

Protótipo das duas telas em [`preview.html`](preview.html), no tema real do painel.

## O que o usuário pediu, e como esta spec o lê

- **"precisamos das somas dos itens linha por linha"** — cada linha de item da devolução leva
  **quantidade devolvida × valor unitário da NF-e = soma da linha**, e o e-mail imprime uma linha por
  item e a **soma geral** das linhas. O `NFD 45029 – R$ 57,20` do SAC é o valor do que a loja
  devolveu: por padrão é a soma geral; quando a NFD da loja tem outro valor, é o valor digitado.
- **"digitação de valor pago por avaria"** — quem registra pode (ou deve, conforme o tipo) **digitar o
  valor pago/creditado** pela avaria, por linha ou pela ocorrência inteira, quando ele não é o da
  nota. O valor digitado **substitui** a soma calculada no e-mail; a soma calculada continua
  disponível (`{{somaItens}}`) para quem quiser imprimir as duas.

  Opções consideradas, **decidida por delegação em 2026-10-06 — o usuário pode reverter antes da
  execução**:

  | Opção | O que é                                                                                                                                         | Veredito                                                                                                                       |
  | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
  | A     | Só soma calculada (quantidade × `vUnCom`), nada digitado                                                                                        | descartada: não cobre a NFD com valor diferente da nota, que é o motivo do pedido                                              |
  | B     | Só valor digitado, sem soma calculada                                                                                                           | descartada: obriga digitar o que a NF-e já sabe, e perde a conferência                                                         |
  | **C** | Soma calculada sempre; valor pago digitado **opcional ou obrigatório conforme o tipo**, por item ou pela ocorrência; o digitado vence no e-mail | **recomendada e adotada**                                                                                                      |
  | D     | Usar o acerto da 164 (`trip_occurrence_item_settlements`) como valor pago                                                                       | descartada: o acerto só existe depois de a tratativa decidir `goods_paid`; o e-mail sai no registro. A 164 não muda (ver RF12) |

  Custo de reverter para A: desligar o campo no tipo (`declared_amount_mode = off`); nenhuma
  migration.

- **"a Spani é a contratante na nota"** — `{{contratante}}` é a **contratante da nota** (o emitente
  casado em `contractors` pelo CNPJ dentro da empresa, regra de `findChargeParties`, specs 143 RF3 e
  150 RF4; lido em `delivery-proof-read.support.ts:1299`). O assunto do SAC fica
  `OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL`. **"SPANI" nunca aparece no
  código**: é o nome de uma contratante, e o modelo é dado do tipo.
- **"não entendi 'na entrega da nota'?"** — ver "O que é o momento" abaixo.

## O que é o momento (explicação para a operação)

O **momento** responde: **quem registra a ocorrência, e sobre o quê**. Não é o horário, nem a etapa
da nota. A spec 246 gravou quatro (`OCCURRENCE_MOMENTS`, `trip-occurrence.constant.ts:61-66`):

| Rótulo hoje na aba Tipos   | O que é, na operação                                        | Exemplo                                   |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Separação no galpão        | o **separador**, no galpão, antes de a carga sair           | caixa amassada achada na conferência      |
| Entrega da nota            | o **motorista**, na frente do cliente, sobre **uma nota**   | o mercado devolveu dois fardos daquela NF |
| Chegada à parada           | o **motorista**, sobre o **lugar**, sem nota específica     | portão fechado, ninguém para receber      |
| Escritório, pelo motorista | o **operador**, no painel, registrando em nome do motorista | o motorista ligou e contou                |

"Entrega da nota" confunde porque soa como "a hora em que a nota foi entregue". **Proposta (plan §
Rótulos), decidida por delegação em 2026-10-06 — reversível, só texto:** o título do bloco passa a
**"Quem registra, e onde"**, e os rótulos passam a **"Separador, no galpão"**, **"Motorista, numa
nota"**, **"Motorista, na parada"** e **"Escritório, pelo motorista"**, cada um com a linha de exemplo
da tabela acima como dica. Os valores gravados (`separation`, `document`, `stop`, `office`) não mudam.
Alternativa descartada: manter os rótulos e só pôr dica — a palavra "entrega" continua puxando para
"horário". Custo de reverter: trocar o `.locale.json`.

Para as devoluções do SAC o momento é **"Motorista, numa nota"** (e, se a operação quiser, também
"Escritório, pelo motorista").

## Tudo é configuração do tipo

Restrição do usuário (2026-10-06): _"isso deve ser tudo configuração na criação do tipo de
ocorrência"_. Consequências, todas obrigatórias:

- **Nenhum tipo é tratado por nome ou por constante no código.** "Devolução parcial" e "Devolução
  total" são **linhas de `company_occurrence_types`**, criadas e editadas na aba Tipos. Todo
  comportamento desta spec sai de colunas do tipo. Contraexemplo que **não** se repete: a migration da
  241 casou a segunda via do boleto por nome exato (`20261006033752_occurrence_type_items_mode/
migration.sql:14`, `WHERE "name" = 'Cliente pediu segunda via do boleto'`).
- **Cada capacidade nova é um campo do tipo**, com vocabulário fechado, default que não muda nada do
  que existe, CHECK no banco e validação na escrita — o padrão da 241/246.
- **Um contrato prova que o comportamento muda só por campo**: o mesmo código, dois tipos com nomes
  iguais e configuração diferente, resultado diferente; e dois tipos com nomes diferentes e
  configuração igual, resultado igual (CA03, com mutação).

### Campos novos do tipo (`company_occurrence_types`)

| Campo (coluna)             | Vocabulário                                                    | Default                          | O que governa                                                            |
| -------------------------- | -------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `reference_number_mode`    | `off` · `optional` · `required` (`DELIVERY_PROOF_FIELD_MODES`) | `off`                            | se o registro pede o **número do documento do cliente**                  |
| `reference_number_label`   | texto, 1–40 caracteres                                         | `Número do documento do cliente` | o rótulo desse campo na tela de registro (ex.: "Número da NFD")          |
| `declared_amount_mode`     | `off` · `optional` · `required`                                | `off`                            | se o registro pede o **valor pago** digitado                             |
| `declared_amount_scope`    | `item` · `occurrence`                                          | `item`                           | se o valor pago é digitado por linha ou um só pela ocorrência            |
| `declared_amount_label`    | texto, 1–40 caracteres                                         | `Valor pago`                     | o rótulo do valor na tela de registro                                    |
| `email_item_line_template` | texto, 0–400 caracteres, marcadores de linha                   | `''` (vazio = linha padrão, RF6) | o formato de **cada linha de item** quando o corpo usa `{{linhasItens}}` |

CHECKs: `declared_amount_scope = 'item'` com `declared_amount_mode <> 'off'` exige `items_mode <> 'off'`
(não há linha para digitar);
`reference_number_label` e `declared_amount_label` não vazios depois de `trim`.

### Campos que já existem e passam a ser editáveis na tela (sem duplicar)

| Campo                                                        | De quem é                                 | O que muda                                                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `emails_contractor`                                          | spec 183 (aviso automático à contratante) | ganha interruptor na aba: **"Mandar e-mail à contratante ao registrar"**. Hoje o painel ignora a chave (`tripResponse.validation.ts:1871`) |
| `email_subject`, `email_body`                                | spec 079 (modelo próprio)                 | ganham editor na aba, com a lista fechada de marcadores e **prévia renderizada**                                                           |
| `notifies`, `email_template_key`                             | spec 079 (aviso interno)                  | continuam; o bloco passa a dizer a verdade: avisa **quem despachou a viagem**, não a contratante                                           |
| `items_mode`, `items_minimum_count`, `allows_multiple_items` | 241/246/166                               | sem mudança de regra; a devolução parcial usa `required`                                                                                   |
| `note_mode`, `attachment_mode`, `photo_minimum_count`        | 246/179                                   | sem mudança; a parcial do SAC usa foto `required` ("foto nítida da mercadoria avariada")                                                   |

### Exceção por contratante e por destinatário (camada da 246)

A exceção da 246 declara **o que muda**, campo a campo, com nulo herdando do tipo
(`resolve-with-overrides.policy.ts`). **Decidido por delegação em 2026-10-06 — reversível:**

- **Entram na exceção** (colunas **nulas, sem default**, nas duas tabelas):
  `reference_number_mode` e `declared_amount_mode`. São exigência — mesma natureza de foto,
  observação, assinatura e produtos.
- **Não entram:** rótulos, `declared_amount_scope`, `email_item_line_template`, `email_subject`,
  `email_body`, `emails_contractor`. O escopo muda a forma do dado gravado; o modelo de e-mail por
  contratante seria um **segundo mecanismo** de modelo. Quem precisa de outro e-mail para outra
  contratante cadastra outro tipo. Custo de reverter: colunas nulas a mais nas tabelas de exceção,
  migration aditiva.

## Achados no código que esta spec corrige

- **O bloco Notificação da aba Tipos descreve um destinatário errado.** A dica diz "O e-mail que o
  contratante recebe" (`companySettings.locale.json:440`), mas o par `notifies` + `email_template_key`
  avisa **quem despachou a viagem** (`occurrence-notifier.gateway.ts:24-27`, `recipientUserId:
row.actorUserId`). O e-mail à contratante é o outro par, `emails_contractor` + `email_subject`/
  `email_body` (spec 183, `send-automatic-occurrence-mail.use-case.ts:82-89`), que o painel não edita.
- **Escolher um modelo do aviso interno apaga o e-mail à contratante.** `saveOccurrenceType` grava
  `emailBody: ''` e `emailSubject: ''` quando há `emailTemplateKey`
  (`save-occurrence-type.use-case.ts:147`), e o aviso automático sem assunto pula com `no_template`
  (`drizzle-occurrence-mail.repository.ts:209`). São dois canais para dois destinatários; um não pode
  zerar o outro (RF2).
- **`{{valorNota}}` sai cru** (`7840.6400`). Passa a sair em formato brasileiro sem símbolo
  (`7.840,64`), para que um modelo `R$ {{valorNota}}` já gravado continue certo (RF7).
- **`{{quantidadeItem}}` imprime a quantidade da NF-e**, não a da ocorrência (RF8).

## Fora do escopo

- **A prorrogação do boleto** — spec 248.
- **A regra da tratativa** (164): `redelivery_policy`, `decision_kind` (`redelivery_authorized`,
  `goods_paid`, `other`), acerto por item e `returned_goods` em `delivery_charges` não mudam. Esta
  spec só **sugere** o valor do acerto a partir do registro (RF12).
- **Motivo por item.** A linha do SAC termina com o motivo ("Avaria identificada no momento da
  conferência"); aqui ele sai da **observação** da ocorrência, comum a todas as linhas. Motivo próprio
  por linha é spec à parte (coluna nula, aditiva).
- **Registro pelo escritório em nome do motorista com itens.** O diálogo do escritório
  (`FieldOccurrenceDialog.component.tsx`) continua com observação e foto; o escritório completa
  itens, número e valor pela **correção** (240), que esta spec amplia.
- **Galpão** (`separation`): os campos novos valem só nos momentos de rua e escritório, como os da
  246; a tela diz isso.
- **Modelo de e-mail por contratante** (ver exceções).
- **Retroatividade**: ocorrência já gravada não ganha valor unitário nem número.

## Histórias priorizadas

### P1 — O operador configura a devolução parcial do SAC, sem programador

**Given** sou operador com `settings.manage` na aba **Tipos** de `/ocorrencias`
**When** crio (ou edito) "Devolução parcial" com momento "Motorista, numa nota", Produtos
**Obrigatório**, Foto **Obrigatório**, Número do documento do cliente **Obrigatório** com rótulo
"Número da NFD", Valor pago **Opcional por linha**, ligo "Mandar e-mail à contratante ao registrar" e
escrevo o assunto, o corpo e a linha de item do SAC
**Then** a prévia ao lado mostra o e-mail renderizado com dados de exemplo, uma linha por item e as
somas
**And** um marcador escrito errado (`{{numeroNfd}}`) é recusado ao salvar, com o nome do marcador.

### P2 — Quem registra vê a soma de cada linha e a soma geral

**Given** a nota 680481 tem a linha `2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO`, unidade `FD`,
valor unitário R$ 57,20
**When** o motorista marca esse item, quantidade 1
**Then** a linha mostra `1 FD × R$ 57,20 = R$ 57,20` e o rodapé mostra a soma geral R$ 57,20
**And** o botão de registrar só libera com o número da NFD e a foto, porque o tipo os exige.

### P3 — O valor pago digitado vence

**Given** a NFD da loja foi de R$ 50,00 para aquela linha
**When** o motorista digita 50,00 em "Valor pago" da linha
**Then** a linha mostra a soma calculada (R$ 57,20) e o valor pago (R$ 50,00), e o e-mail imprime
`NFD 45029 – R$ 50,00`
**And** `{{somaItens}}` continua R$ 57,20 para quem quiser imprimir os dois.

### P4 — O e-mail sai no padrão do SAC

**Given** o tipo configurado como em P1 e a ocorrência de P2
**When** a ocorrência é registrada
**Then** o aviso automático à contratante da nota (183) sai com o assunto
`OCORRÊNCIA: SPANI – NF 680481 – DEVOLUÇÃO PARCIAL` — "SPANI" vindo de `{{contratante}}` — e o corpo
do SAC, com uma linha por item.

### P5 — O escritório corrige e completa

**Given** a ocorrência foi registrada sem o número da NFD (tipo com o campo opcional)
**When** o operador abre a correção (240)
**Then** consegue ajustar itens, quantidades, valor pago e número, e a correção guarda o estado
anterior (`previous_items`, 167).

## Requisitos funcionais

- **RF1** O tipo ganha os seis campos da tabela "Campos novos do tipo", com CHECK no banco gerada da
  constante (nada de lista literal), validação no `PUT /company-settings/occurrence-types` e leitura
  em todo `GET` que já devolve o tipo. Escrever `declared_amount_scope = 'item'` com
  `declared_amount_mode <> 'off'` em tipo com `items_mode = 'off'` volta
  `422 OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS`.
- **RF2** `email_template_key` (aviso interno) e `email_subject`/`email_body` (e-mail à contratante)
  passam a ser **independentes**: salvar um não apaga o outro. `renderEmail` do registro
  (`register-trip-occurrence.use-case.ts:481`) deixa de pular o modelo próprio quando há chave.
  **Efeito declarado:** um tipo que hoje tem chave e texto vazio continua sem e-mail à contratante até
  o operador escrever o texto.
- **RF3** A aba Tipos ganha, no tipo aberto, os blocos **"Dados do registro"** (número do documento do
  cliente e valor pago, com rótulo e modo) e **"E-mail à contratante"** (interruptor
  `emails_contractor`, assunto, corpo, linha de item, lista de marcadores clicável que insere no
  cursor, prévia renderizada). O bloco "Notificação" passa a se chamar **"Aviso interno"** e a dica diz
  que o aviso vai a quem despachou a viagem.
- **RF4** A prévia do cadastro é renderizada **pelo servidor** com dados de exemplo fixos
  (`POST /company-settings/occurrence-types/email-preview`, `settings.manage`), pela mesma função do
  envio. Nenhuma segunda implementação no painel.
- **RF5** Lista fechada de marcadores, em dois contextos, recusados no cadastro (`400` com
  `UNKNOWN_TEMPLATE_PLACEHOLDER` e o nome do marcador):
  - **Corpo e assunto** (os 11 de hoje e mais): `{{linhasItens}}` (só no corpo), `{{somaItens}}`,
    `{{valorDeclarado}}`, `{{numeroReferencia}}`, `{{numeroNotaSemSerie}}`.
  - **Linha de item** (só em `email_item_line_template`): `{{codigoItem}}`, `{{item}}`,
    `{{quantidadeItem}}`, `{{unidadeItem}}`, `{{valorUnitarioItem}}`, `{{somaItem}}`,
    `{{valorItem}}`, mais os de ocorrência (`{{observacao}}`, `{{numeroNota}}`…). `{{linhasItens}}`
    dentro da linha é recusado (recursão).
- **RF6** `{{linhasItens}}` imprime **uma linha por item marcado**, na ordem de marcação, separadas
  por quebra de linha, cada uma renderizada com `email_item_line_template`; vazio usa a linha padrão
  `{{codigoItem}} – {{item}} – {{quantidadeItem}} {{unidadeItem}} – R$ {{valorItem}}`. Ocorrência sem
  item imprime vazio, nunca o marcador. Teto de 200 linhas (o e-mail diz "e mais N itens").
- **RF7** Valores monetários nos marcadores (`valorNota`, `somaItens`, `valorDeclarado`,
  `valorUnitarioItem`, `somaItem`, `valorItem`) saem em formato brasileiro **sem símbolo**:
  `7.840,64`. O modelo escreve `R$`. Calculados em inteiro (`bigint`), nunca `number` binário.
- **RF8** `{{quantidadeItem}}` passa a imprimir a **quantidade registrada na ocorrência**
  (`trip_document_occurrence_products.quantity`); só cai na quantidade da NF-e quando a ocorrência não
  registrou quantidade (linha inteira). Formato brasileiro, sem zeros à direita (`1`, `2,5`).
  **Efeito declarado** em modelo já gravado: passa a imprimir o número certo.
- **RF9** Soma da linha = quantidade devolvida × valor unitário comercial da NF-e (`vUnCom`,
  `nfe_products.unit_value numeric(19,4)`), **arredondada a centavos, meio para cima, por linha**.
  Linha sem quantidade = `nfe_products.total_value` (`vProd`). Soma geral = soma das linhas
  arredondadas (o e-mail fecha na conta que o leitor faz). `{{valorItem}}` = valor pago digitado da
  linha, senão a soma da linha. `{{valorDeclarado}}` = valor pago da ocorrência (escopo
  `occurrence`), senão a soma dos `valorItem`.
- **RF10** O registro guarda, por linha, o **valor unitário da NF-e no momento do registro**
  (`unit_value`, cópia) e o valor pago digitado (`declared_amount`, nulo); pela ocorrência, o número
  do documento do cliente (`reference_number`) e o valor pago de escopo `occurrence`
  (`declared_amount`). A soma nunca é gravada: é derivada.
- **RF11** O **app do motorista** passa a listar os produtos da nota no registro (hoje só oferece "A
  nota inteira", `OccurrenceProductsField.component.tsx:14-37`): marcar, quantidade na unidade da
  nota (172), soma da linha, soma geral, valor pago (conforme o tipo) e o número (conforme o tipo). O
  snapshot da viagem passa a trazer os produtos de cada nota (código, descrição, unidade, quantidade,
  valor unitário) e a rota de registro passa a aceitar os itens. O botão só libera com o que o tipo
  efetivo exige (regra da 246, RF7), incluindo o mínimo de produtos que a 246 deixou sem cumprir no
  app.
- **RF12** O acerto da tratativa (164, `OccurrenceSettlementPanel`) passa a **sugerir** o valor de
  cada item a partir do registro — o pago digitado, senão a soma da linha —, com `amountSource`
  `manual` ou `nfe` conforme a origem. O operador continua confirmando; nenhuma regra da 164 muda.
- **RF13** A correção (240/167) passa a editar o número e os valores pagos, com o estado anterior em
  `previous_items`, e o e-mail não é reenviado sozinho.
- **RF14** O servidor cobra o que o tipo **efetivo** exige (tipo + exceção, `resolveWithOverrides`),
  com códigos estáveis: `TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED`,
  `TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED`; valor negativo ou com mais de 2 casas volta `400`;
  número com caractere fora de `[A-Za-z0-9 ./-]` ou mais de 30 caracteres volta `400`.

## Requisitos não funcionais

- **Dinheiro é `numeric` no banco e inteiro na conta.** Valor pago `numeric(14,4)` (mesma escala de
  `trip_occurrence_item_settlements.amount`), valor unitário copiado `numeric(19,4)` (a da NF-e).
  Nenhum `parseFloat`/`Number()` em valor monetário — contrato de parede proíbe, e a mutação prova.
- Migration aditiva com `rollback.sql`; nenhum ENUM nativo; CHECKs nomeadas ≤ 63 caracteres.
- `companyId` do contexto autenticado. O valor unitário é lido **da nota no servidor**, nunca do
  payload: o app manda código e quantidade, não preço.
- Nenhum número de documento, CNPJ, nome ou valor em log — só ids.
- O e-mail continua multipart com HTML escapado (`occurrence-mail.template.ts:28-47`,
  `escapeMailHtml`); nada de HTML vindo do modelo.
- **Ordem de publicação (ADR-0081 §9):** painel e app tolerantes às chaves novas → banco e API → telas
  que escrevem os campos.
- O app do motorista continua funcionando sem rede: produtos e exigências vêm do snapshot, a soma é
  calculada no aparelho com a mesma regra (contrato espelho), e o servidor recalcula.

## Casos extremos e falhas

- **Mesmo `cProd` em duas linhas da nota** — a ocorrência aponta produto por código (166). O valor
  unitário vem da linha de menor `ordinal` com esse código; se as linhas tiverem valores diferentes,
  a tela mostra o aviso "valor unitário varia na nota" e o valor pago passa a ser obrigatório naquela
  linha.
- **Quantidade devolvida maior que a da nota** — recusada (`400 OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT`),
  comparada com a **soma** das linhas da nota com o código. Correção de 2026-10-07 (T4.4): o texto dizia
  "como hoje na 166", mas a política da 166 (`occurrence-item-quantity.policy.ts`) só recusa zero, negativo
  e unidade desconhecida — nunca comparou com a nota. A recusa nasce nesta spec.
- **Nota sem `nfe_products`** (nota manual) — soma vazia; o tipo com valor pago `required` ainda
  funciona por digitação.
- **Modelo usa `{{linhasItens}}` em tipo com `items_mode = off`** — aceito, imprime vazio; a prévia
  avisa.
- **Valor pago zero** — aceito (a loja não pagou nada); diferente de vazio.
- **Cache velho no aparelho** — o servidor recalcula a soma e cobra a exigência efetiva; a mensagem
  diz o campo.

## Critérios de aceite

- **CA01** Um tipo configurado como no roteiro do SAC gera, para a ocorrência de exemplo, exatamente
  o assunto e o corpo da seção "Modelos do SAC" (com `SPANI` vindo do nome da contratante da nota) —
  contrato do renderizador e integração do registro ao aviso automático.
- **CA02** Soma por linha e geral corretas com quantidade fracionária e arredondamento meio para cima
  (`2,5 × 0,3333 = 0,83`; `3 × 19,995 = 59,99` por linha, e soma das linhas arredondadas) — contrato,
  com mutação (trocar meio-para-cima por truncamento; somar antes de arredondar; usar `number`).
- **CA03** **Só a configuração muda o comportamento**: dois tipos com o mesmo nome e campos diferentes
  produzem exigências e e-mails diferentes; dois tipos com nomes diferentes e mesmos campos produzem o
  mesmo — contrato e integração, com mutação (um `if` pelo nome do tipo deixa vermelho).
- **CA04** Marcador desconhecido, `{{linhasItens}}` dentro da linha e marcador de linha no assunto
  são recusados no cadastro — contrato.
- **CA05** Salvar `email_template_key` não apaga `email_subject`/`email_body`, e o aviso automático
  à contratante sai num tipo que tem os dois — integração, com mutação (devolver o `emailBody: ''`).
- **CA06** O registro do motorista recusa sem número/valor quando o tipo efetivo exige, aceita quando
  a exceção afrouxa, e grava `unit_value` lido da nota mesmo que o payload mande preço — integração.
- **CA07** O app do motorista mostra os produtos, a soma da linha e a geral, e só libera o botão com
  o exigido, sem rede — contrato do app.
- **CA08** `make migration-test` verde com `rollback.sql`; o rollback não toca colunas da 241/246.
- **CA09** Revisão de design e usabilidade com print em 375, 768 e 1280, e comparação lado a lado do
  `preview.html` com a tela real.
- **CA10** Passada independente de funcionalidade, usabilidade e design por `code-reviewer`.

## Modelos do SAC (valores exatos do roteiro)

Os textos abaixo são **dado** que o operador digita na aba Tipos. Nenhum entra no código, no seed
nem em migration.

### Devolução parcial

- Momentos: **Motorista, numa nota** (e, se quiser, **Escritório, pelo motorista**).
- Foto **Obrigatório** (mínimo 1) · Observação **Obrigatório** · Assinatura **Desligado** ·
  Produtos **Obrigatório**, "Ao menos 1 item" · vários produtos: sim.
- Número do documento do cliente **Obrigatório**, rótulo **"Número da NFD"**.
- Valor pago **Opcional**, **por linha**, rótulo **"Valor pago pela loja"**.
- Política de reentrega: a que a operação já usa para recusa parcial (164; não muda aqui).
- Mandar e-mail à contratante ao registrar: **ligado**.
- Assunto: `OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL`
- Corpo:

  ```text
  Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.

  NFD {{numeroReferencia}} – R$ {{valorDeclarado}}
  RAZÃO SOCIAL: {{razaoSocial}}
  NOTA FISCAL: {{numeroNotaSemSerie}}
  VALOR DA ENTREGA: R$ {{valorNota}}

  {{linhasItens}}
  ```

- Linha de item: `{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}} – {{observacao}}`

  Com a nota do exemplo, sai `2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO – 1FD – Avaria identificada
no momento da conferência das mercadorias`. O SAC escreveu `01FD`; zero à esquerda não é exigência
  do formato e não se imita.

### Devolução total

- Momentos e foto como a parcial · Observação **Obrigatório** (é o "Motivo") · Produtos
  **Desligado** · Número do documento do cliente **Opcional**, rótulo "Número da NFD" · Valor pago
  **Desligado**.
- Assunto: `DEVOLUÇÃO TOTAL – NF {{numeroNotaSemSerie}}`
- Corpo:

  ```text
  Cliente devolveu a nota.
  Motivo: {{observacao}}

  RAZÃO SOCIAL: {{razaoSocial}}
  NOTA FISCAL: {{numeroNotaSemSerie}}
  VALOR DA ENTREGA: R$ {{valorNota}}
  ```

  A linha "Observação: o cliente já havia recebido…" do SAC é exemplo de motivo e entra na
  observação.

### `{{numeroNota}}`

Hoje imprime `número/série` quando há série (`delivery-proof-read.support.ts:1300`). O SAC escreve
só o número. **Decidido por delegação em 2026-10-06 — reversível:** `{{numeroNota}}` não muda (outros
modelos já gravados dependem dele), e entra `{{numeroNotaSemSerie}}` na lista fechada; o roteiro usa
este. Custo de reverter: tirar o marcador da lista.

## Os tipos que já existem ("Recusa parcial", "Recusa total")

O catálogo de bootstrap semeia "Recusa parcial" e "Recusa total"
(`occurrence-type-catalog.constant.ts:34-35`), e o seed só roda em empresa **sem nenhum tipo**
(`occurrence-type-catalog-seed.service.ts:94-95`). **Decidido por delegação em 2026-10-06 —
reversível:** a empresa **configura os tipos que já tem** pela aba Tipos (e pode renomear "Recusa
parcial" para "Devolução parcial" — o id não muda, o histórico e os relatórios continuam somando
juntos). Alternativas descartadas: criar tipos novos ao lado (parte o relatório em dois ids, o defeito
que a 246 descreveu para "Avaria"); mudar o catálogo de bootstrap (não alcança empresa existente, e
reconciliar no seed sobrescreveria edição do operador a cada deploy — a lição da 208/241). Custo de
reverter: renomear de volta na tela.

## Dúvidas

Nenhuma aberta. As decisões tomadas por delegação estão marcadas no texto (2026-10-06) e reunidas em
`plan.md` § Decisões por delegação.
