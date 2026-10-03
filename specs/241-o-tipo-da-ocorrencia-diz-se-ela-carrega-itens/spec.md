# Feature 241 — O tipo da ocorrência diz se ela carrega itens

Origem: pendência da spec 240 (`specs/240-a-correcao-da-ocorrencia-ganha-tela/evidence.md`, § T6.4 e
§ "Pendências depois da Fase 6"), mais o template de ocorrências do SAC
(`Template de ocorrências.docx`: devolução parcial com itens e foto, devolução total e prorrogação
de boleto).

## Problema e resultado

O painel decide se uma ocorrência pode ser **corrigida** olhando os itens gravados nela
(`resolveOccurrenceCorrectionActions`, `tripOccurrenceDetail.service.ts:188`: `hasItems ||
wasCorrected`). Esse é o sinal errado, e erra para os dois lados:

1. **A avaria sobre a nota inteira não se corrige.** O fluxo do operador pelo WhatsApp grava sempre
   `productCodes: []` (`apps/api-transportada/src/main.ts`, comentário "a ocorrência é sempre da nota
   inteira"), e a ocorrência do motorista sai do app com `productCode: ''`
   (`DriverTripWorkspace.page.tsx`, `notDelivered.service.ts`). São ocorrências de tipos que **podem**
   ter itens — avaria, recusa parcial —, e quem atende o caso precisa marcar quais produtos foram.
   Hoje só existe Cancelar e registrar outra, que é o defeito que a 167 nasceu para acabar.
2. **O tipo que não tem item nenhum oferece seletor de item.** "Cliente pediu segunda via do
   boleto" (spec 208) e a prorrogação de boleto do SAC não tocam a carga. Mesmo assim o registro
   mostra o seletor de produtos para todo tipo de nota (`TripOccurrences.component.tsx`), e nada
   impediria alguém de "corrigir" uma prorrogação para ter três produtos.

A raiz é uma só: **o tipo não diz se carrega itens.** `company_occurrence_types`
(`database/trip.schema.ts:2511`) tem `allows_multiple_items` (um item ou vários, spec 166),
`attachment_mode` (foto), `leaves_document_behind` e `redelivery_policy`, e nenhuma coluna para isso.
O detalhe, o feed e a lista da nota também não publicam o **id** do tipo, só `stage` e `typeName`.
Pelo mesmo motivo, o formulário de correção não sabe o teto de um item e só descobre pelo `422
OCCURRENCE_TYPE_SINGLE_ITEM` do servidor (item 4 da T6.6 da 240, não feito).

Ao fim: o tipo declara se a ocorrência carrega produtos — **Desligado** ou **Opcional** —, o
registro só mostra o seletor quando carrega, o detalhe mostra **Corrigir** por tipo, e o formulário
de correção conhece o teto de um item antes do envio. O catálogo ganha a prorrogação de boleto.

## Decisão já tomada em outra spec (não duplicar)

A spec 239 (`specs/239-a-exigencia-da-ocorrencia-chega-na-rua/`, ainda só em `work/spec-239`, sem
código) **já decidiu o eixo**: RF1 dá ao tipo `itemsMode` (`off` / `optional` / `required`),
reaproveitando `DELIVERY_PROOF_FIELD_MODES`, e o plano cria a coluna `items_mode varchar(16)`. Esta
spec **não cria um segundo eixo**: ela entrega a coluna `items_mode` da 239, com o mesmo nome e o
mesmo vocabulário, adiantada e restrita aos estados `off` e `optional`. `required` (ao menos um
produto, quantidade mínima, "todos os itens") continua da 239.

⚠️ **Divergência que a 241 corrige na 239:** o plano da 239 nasce a coluna com `DEFAULT 'off'`
dizendo "a 166 nunca exigiu produto, então nada muda". No vocabulário de
`DELIVERY_PROOF_FIELD_MODES`, `off` é "não aparece" — e hoje o seletor aparece, opcional, para todo
tipo. O estado que preserva o comportamento é `optional`. Ver `plan.md` § Decisões.

## Fora do escopo

- **`itemsMode = required`** e tudo o que vem com ele (RF1b, RF1c2 da 239). A 241 aceita só `off` e
  `optional` na escrita.
- **Reabrir regra da 164 ou da 167**: janela de correção, estados da tratativa, decisões
  (`redelivery_authorized`, `goods_paid`, `other`) e suas devolutivas. Ver Dúvidas.
- **Corrigir o tipo** da ocorrência (167, fora de propósito).
- **A ocorrência de parada** (`trip_stop_occurrences`, `flow = stop`): não tem itens nem correção.
- **O app do motorista**: ele já não oferece seletor de item (manda `productCode: ''`), e nada muda
  lá. O campo novo vem no tipo e é ignorado pelo guard tolerante do app.
- **Momentos, exigências de observação/assinatura e a mudança de endereço da aba Tipos**: 239.
- **Modelo de e-mail da prorrogação.** O SAC tem um assunto e um corpo próprios; o tipo nasce como o
  da 208 (sem aviso), e o modelo se escolhe no cadastro.

## Histórias priorizadas

### P1 — A avaria da nota inteira se corrige

**Given** uma ocorrência de "Avaria" registrada pelo WhatsApp, sem itens, sem tratativa, e o tipo
"Avaria" com Produtos em **Opcional**
**When** abro o detalhe com `trip.manage`
**Then** vejo **Corrigir**, marco os produtos avariados e salvo
**And** a correção grava como qualquer outra da 167.

### P1 — A prorrogação não finge ter produto

**Given** o tipo "Prorrogação de boleto" com Produtos em **Desligado**
**When** registro a ocorrência ou abro o detalhe dela
**Then** o seletor de produtos não aparece no registro e o detalhe oferece só **Cancelar**
**And** a API recusa com `422 OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` registro ou correção com produto
para esse tipo.

### P2 — O operador diz no cadastro se o tipo carrega itens

**Given** estou no cadastro de tipos de ocorrência (`settings.manage`)
**When** abro um tipo de nota
**Then** vejo **Produtos**: Desligado / Opcional, ao lado de "um ou vários" (`allows_multiple_items`),
que só aparece com Produtos em Opcional.

### P3 — O formulário de correção sabe o teto de um item

**Given** um tipo com `allows_multiple_items` desligado
**When** abro Corrigir
**Then** o seletor é de escolha única, como no registro — o `422 OCCURRENCE_TYPE_SINGLE_ITEM` fica
como segunda linha de defesa.

## Requisitos funcionais

- **RF1** `company_occurrence_types` ganha `items_mode varchar(16) NOT NULL DEFAULT 'optional'`, com
  CHECK nos valores de `DELIVERY_PROOF_FIELD_MODES` (o mesmo CHECK de `attachment_mode`). Nada de
  ENUM nativo.
- **RF2** A migration põe `off` nos tipos semeados sem itens que já existem: os que ainda têm o nome
  exato do catálogo para a segunda via do boleto (etapa `delivery`, `flow = document`). Todo o resto
  fica `optional` pelo default — comportamento de hoje.
- **RF3** O catálogo de bootstrap ganha `itemsMode` por entrada: `off` para "Cliente pediu segunda
  via do boleto" e para o tipo novo **"Cliente pediu prorrogação do boleto"** (`delivery`, sem foto,
  sem soltar a nota — os mesmos defaults de coluna que a 208 usou); `optional` para os derivados de
  `TRIP_OCCURRENCE_TYPES`. O seed grava o `itemsMode` explicitamente.
- **RF4** O cadastro (`PUT /company-settings/occurrence-types`, `save-occurrence-type.use-case.ts`)
  aceita `itemsMode` em `off | optional`, **opcional sem default** — ausente é "não mexa", como
  `attachmentMode` (`occurrence.schema.ts:298`). `required` volta `400` até a 239.
- **RF5** As leituras publicam, só leitura: a listagem de tipos do cadastro e
  `/me/trips/current/occurrence-types` passam a trazer `itemsMode`; o detalhe da ocorrência, o feed
  e a lista da nota passam a trazer `occurrenceTypeId`, `typeItemsMode` e `typeAllowsMultipleItems`,
  lidos do tipo **atual** por junção, em lote, sem N+1.
- **RF6** `registerTripOccurrence`, o registro do escritório em nome do motorista e
  `correct-occurrence-items.use-case.ts` recusam produto (`productCodes` não vazio ou `productCode`
  não vazio) em tipo `off` com `422 OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED`, antes de gravar ou avisar.
  Lista vazia segue válida em qualquer tipo.
- **RF7** O painel decide **Corrigir** por `typeItemsMode !== 'off' || hasItems || wasCorrected`. Os
  dois últimos termos ficam para a ocorrência antiga gravada com produto num tipo que depois virou
  `off`, e para a API anterior (campo ausente lê como `optional`).
- **RF8** O registro (`TripOccurrences.component.tsx`, `SeparationOccurrenceDialog.component.tsx`)
  esconde o seletor de produtos e as quantidades para tipo `off`, e limpa a seleção ao trocar para
  ele, como já faz com o teto de um item (`TripOccurrences.component.tsx:160`). Esse registro só
  oferece tipos de galpão (`TripOccurrences.component.tsx:130`); os registros de rua
  (`FieldOccurrenceDialog`, app do motorista, lote do escritório) já não têm seletor e mandam
  `productCode: ''`. O RF8 vale, portanto, para tipo de galpão posto em `off`.
- **RF9** O formulário de correção usa `typeAllowsMultipleItems` para a seleção única.
- **RF10** O cadastro de tipos mostra **Produtos** (Desligado / Opcional) com o `Select` do design
  system e o mesmo vocabulário de três palavras da 239 (RF1a); "um ou vários" só aparece com
  Opcional. Fica onde o cadastro estiver quando a task rodar (Configurações → Empresa hoje; aba
  Tipos depois da 239).

## Requisitos não funcionais

- Migration aditiva, com `rollback.sql`, provada por `make migration-test`; `db:generate` termina
  em `no_changes`.
- `companyId` do contexto em toda leitura e escrita. A junção com o tipo é por `(company_id, id)`
  (`company_occurrence_types_company_id_id_unique`).
- Ordem de publicação: painel tolerante antes da API (ADR-0081 §9; 240 T6.1). Ver `plan.md`.
- Nenhum nome de produto, CNPJ ou motivo em log.

## Casos extremos e falhas

- **Tipo muda de Opcional para Desligado com ocorrências com itens já gravadas** — elas continuam com
  os itens e continuam corrigíveis (RF7); a correção dela para lista vazia é aceita, com produto não.
  Não há retroatividade.
- **Tipo renomeado antes da migration** — não casa com o nome do catálogo e fica `optional`, o
  comportamento de hoje. O operador desliga no cadastro.
- **Cliente antigo mandando produto para tipo `off`** — o único cliente que manda produto é o painel;
  o app do motorista e o WhatsApp mandam lista vazia. O `422` só alcança o painel antigo, e a ordem
  de publicação põe o painel novo antes.
- **Painel novo contra API antiga** — sem `typeItemsMode`, lê como `optional`: Corrigir aparece para
  toda ocorrência de nota sem tratativa; o servidor antigo aceita a correção, como aceita hoje.

## Critérios de aceite

- **CA01** `make migration-test` verde: aplica e reverte; depois da migration, um tipo semeado antes
  dela com o nome da segunda via está `off` e os demais `optional` — integração sobre dado semeado
  **antes** da coluna.
- **CA02** Empresa vazia semeada recebe os dois tipos de boleto com `items_mode = 'off'` e os
  derivados com `optional` — integração.
- **CA03** Registro e correção com produto em tipo `off` voltam `422
OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` sem gravar nem chamar o notificador; com lista vazia, gravam —
  contrato.
- **CA04** Detalhe, feed e lista da nota trazem `occurrenceTypeId`, `typeItemsMode` e
  `typeAllowsMultipleItems` do tipo da empresa do token — integração, com tipo de outra empresa no
  banco.
- **CA05** Painel: ocorrência sem itens de tipo `optional` mostra Corrigir; de tipo `off`, só
  Cancelar; resposta sem os campos novos se comporta como `optional` — contrato.
- **CA06** Painel: o seletor de produtos some no registro para tipo `off` e a seleção é limpa ao
  trocar de tipo — contrato.
- **CA07** O cadastro grava `itemsMode`; ausente não mexe; `required` volta `400` — contrato e
  integração.
- **CA08** Revisão de design e usabilidade com print nas três larguras: cadastro com Produtos,
  registro com tipo `off` e detalhe com Corrigir por tipo.

## Dúvidas

- **[NEEDS CLARIFICATION] D1 — Tipo sem itens pode abrir tratativa?** `redelivery_policy` diferente
  de `unset` abre tratativa (164 D1). A prorrogação "não interfere em nada na entrega", e as três
  decisões da tratativa (`redelivery_authorized`, `goods_paid`, `other`) disparam cada uma a sua
  devolutiva ao caso — `goods_paid` ainda exige item acertado para fechar (164
  `occurrence-case-state.policy.ts:96`, `422 OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS`). Um tipo
  `off` com política `allowed`/`blocked` abre uma tratativa que talvez não se feche por `goods_paid`;
  com `blocked`, o envio ao contratante sem item já é recusado
  (`OCCURRENCE_CASE_REDELIVERY_BLOCKED_HAS_NO_QUESTION`, `occurrence-case-state.policy.ts:149-158`).
  Opções: (a) CHECK de forma `items_mode = 'off' ⇒ redelivery_policy = 'unset'`, como o tipo `charge`
  da 204; (b) deixar livre, cabendo ao operador; (c) outra regra. É regra da 164, não desta spec.
- **[NEEDS CLARIFICATION] D2 — A prorrogação entra na empresa que já existe?** A 208 decidiu que o
  catálogo é só de bootstrap: empresa com qualquer tipo não recebe tipo novo (208 § Fora do escopo,
  CA3). Com instalação dedicada (ADR-0021), a transportada de produção já tem tipos, e o tipo novo do
  catálogo **não chega a ela**. Opções: (a) manter a regra da 208 e o operador cadastra a
  prorrogação pela tela; (b) a migration insere "Cliente pediu prorrogação do boleto" em toda empresa
  que ainda não tem tipo com esse nome — exceção à regra da 208, que só o usuário pode abrir.
