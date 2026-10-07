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

A spec 246 (`specs/246-a-exigencia-da-ocorrencia-chega-na-rua/`, ainda só em `work/spec-239`, sem
código) **já decidiu o eixo**: RF1 dá ao tipo `itemsMode` (`off` / `optional` / `required`),
reaproveitando `DELIVERY_PROOF_FIELD_MODES`, e o plano cria a coluna `items_mode varchar(16)`. Esta
spec **não cria um segundo eixo**: ela entrega a coluna `items_mode` da 239, com o mesmo nome e o
mesmo vocabulário, adiantada e restrita aos estados `off` e `optional`. `required` (ao menos um
produto, quantidade mínima, "todos os itens") continua da 239.

⚠️ **Divergência que a 241 corrige na 246:** o plano da 246 nasce a coluna com `DEFAULT 'off'`
dizendo "a 166 nunca exigiu produto, então nada muda". No vocabulário de
`DELIVERY_PROOF_FIELD_MODES`, `off` é "não aparece" — e hoje o seletor aparece, opcional, para todo
tipo. O estado que preserva o comportamento é `optional`. Ver `plan.md` § Decisões.

## Fora do escopo

- **`itemsMode = required`** e tudo o que vem com ele (RF1b, RF1c2 da 246). A 241 aceita só `off` e
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
  exato do catálogo para a segunda via do boleto (etapa `delivery`, `flow = document`) — e, **na mesma
  instrução**, normaliza `redelivery_policy` para `unset` nessas linhas (D1), antes de a CHECK do RF11
  entrar. Todo o resto fica `optional` pelo default — comportamento de hoje.
- **RF3** O catálogo de bootstrap ganha `itemsMode` por entrada: `off` para "Cliente pediu segunda
  via do boleto" e para o tipo novo **"Cliente pediu prorrogação do boleto"** (`delivery`, sem foto,
  sem soltar a nota — os mesmos defaults de coluna que a 208 usou: `attachment_mode = 'off'`,
  `leaves_document_behind = false`, `redelivery_policy = 'unset'`, `flow = 'document'`);
  `optional` para os derivados de `TRIP_OCCURRENCE_TYPES`. O seed grava o `itemsMode` explicitamente.
  O tipo novo vale **só para empresa vazia** (regra de bootstrap da 208, D2): a empresa que já tem
  tipos o cadastra pela tela (§ Passo operacional em produção).
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
  system e o mesmo vocabulário de três palavras da 246 (RF1a); "um ou vários" só aparece com
  Opcional. Fica onde o cadastro estiver quando a task rodar (Configurações → Empresa hoje; aba
  Tipos depois da 246).

- **RF11** (D1) Tipo `off` não abre tratativa: CHECK de coluna
  `company_occurrence_types_items_off_shape_check` — `items_mode <> 'off' or redelivery_policy =
'unset'` — na mesma migration, no molde do `company_occurrence_types_charge_shape_check` planejado
  na 204. O servidor (`save-occurrence-type.use-case.ts`) valida o **estado resultante** (valor novo
  ou o gravado, quando ausente) e recusa `off` + política diferente de `unset` com `422
OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY`, antes do `UPDATE` — a CHECK é só a rede.
- **RF12** (D1) O cadastro esconde a escolha de política de reentrega quando **Produtos = Desligado**
  e, ao trocar para Desligado, envia `redeliveryPolicy: 'unset'` no mesmo `PUT`.

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
- **CA09** A CHECK do RF11 existe e recusa a inserção/atualização `off` + `allowed`/`blocked`
  (SQLSTATE 23514) — integração. A
  migration sobre um tipo da segunda via semeado com `redelivery_policy = 'blocked'` termina com
  `off` + `unset` e **sem** violar a CHECK — integração, dado semeado **antes** da coluna. O cadastro
  recusa `off` + política ≠ `unset` com `422 OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY` — contrato.
- **CA10** A tela de cadastro permite criar o tipo da prorrogação já com Produtos = Desligado, sem
  foto, sem soltar a nota e sem política de reentrega, e o registro dele não mostra seletor de
  produtos — contrato do painel + integração do `PUT` com os campos que a 208 usa.

## Passo operacional em produção (D2)

A transportada de produção já tem tipos, então o catálogo de bootstrap **não** lhe entrega a
prorrogação (regra da 208). Depois da etapa 2 publicada (a coluna e a tela de Produtos existem), o
operador, com `settings.manage`, cadastra pela aba de tipos de ocorrência:

1. Nome **Cliente pediu prorrogação do boleto**, etapa **Entrega** (rua), fluxo **Nota**.
2. **Produtos: Desligado** · Foto: Desligada · "Deixa a nota para trás": desligado · Reentrega:
   não decide (`unset`) · sem aviso ao contratante, até a escolha de modelo de e-mail.
3. Conferir no registro que o tipo aparece na rua, não mostra seletor de produtos e não solta a nota
   da viagem — os mesmos campos que a 208 usa para a segunda via.

Nenhuma migration insere esse tipo. Verificação antes do passo: consulta só de leitura (T0.3) sobre
`company_occurrence_types` para confirmar que o nome ainda não existe, e registro em `evidence.md`.

## Ordem de execução entre a 246 e a 241

As duas dão ao tipo a coluna `items_mode`; só uma pode criá-la. **A 241 executa primeiro** (é menor,
sem exigência na rua, e é ela que corrige o default):

1. **Migration da 241:** cria `items_mode varchar(16) NOT NULL DEFAULT 'optional'` com CHECK em
   `off|optional|required`, a CHECK do RF11 e o backfill da segunda via.
2. **A 246 então muda** (sem editar a spec aqui): a migration dela **não** faz `ADD COLUMN items_mode`
   (o plano da 239, § "Produtos, quantidade mínima e anexos da rua", hoje faz, com default `off`);
   fica só com `photo_minimum_count`, `items_minimum_count` e as colunas das três tabelas de
   exceção. A 246 acrescenta ao CHECK de `items_minimum_count` a condição `items_mode = 'required'`
   e passa a aceitar `required` na escrita. A frase "`items_mode` nasce `off` … nada muda" do plano
   dela deixa de valer. Se a 246 sair antes, a 241 teria de trocar o default `off` por `optional`
   com `UPDATE` em todas as linhas — apagando a escolha do operador; por isso a ordem não é
   intercambiável.
3. Vocabulário e nomes não mudam: coluna `items_mode`, campo `itemsMode`, valores `off` / `optional`
   / `required` (`DELIVERY_PROOF_FIELD_MODES`).

⚠️ Numeração: a exigência na rua nasceu como 239 e foi renumerada para **246**
(`specs/246-a-exigencia-da-ocorrencia-chega-na-rua/`); a 239 de `origin/staging` é
`specs/239-o-expurgo-se-liga-na-tela/`. As referências a "239" desta spec passaram a "246".

## Dúvidas

Nenhuma `[NEEDS CLARIFICATION]` aberta. As duas dúvidas foram decididas **por delegação** — o
usuário foi perguntado e respondeu "pode fazer os itens faltantes".

- **D1 — Tipo sem itens pode abrir tratativa? Decidida por delegação em 2026-10-03 — o usuário pode
  reverter antes da execução. Escolha: (a).** Tipo `off` não abre tratativa: CHECK de coluna
  `items_mode = 'off' ⇒ redelivery_policy = 'unset'` (RF11), recusa estável no servidor e política
  escondida no painel (RF12). Razão: uma tratativa sem itens não fecha por `goods_paid` (164
  `occurrence-case-state.policy.ts:96`) e `blocked` sem item é recusado
  (`occurrence-case-state.policy.ts:149-158`); é a opção recomendada pelo autor e a menos invasiva
  (não toca regra da 164). **Descartadas:** (b) deixar livre, a cargo do operador — permite a
  tratativa que não fecha; (c) outra regra — sem demanda. **Custo de reverter:** remover a CHECK e o
  `422` (uma migration aditiva de `DROP CONSTRAINT`, mais a guarda e o `if` do painel); como a
  migration normaliza a política da segunda via para `unset`, esse valor anterior não volta (era
  `unset` em todo tipo semeado pelo catálogo, que nunca escreve política). Ver `plan.md` § D-E.
- **D2 — A prorrogação entra na empresa que já existe? Decidida por delegação em 2026-10-03 — o
  usuário pode reverter antes da execução. Escolha: (a).** Mantém a regra de bootstrap da 208; o
  operador cadastra a prorrogação pela tela (§ Passo operacional em produção). **Descartada:** (b)
  migration insere o tipo em toda empresa que não o tem — exceção à 208 que só o usuário abriria, e
  que criaria linha que o rollback não pode apagar (FK `restrict` de ocorrência). **Custo de
  reverter:** acrescentar um `INSERT … WHERE NOT EXISTS` à migration (ainda não publicada) ou numa
  migration seguinte, mais o teste de integração; sem retrabalho de tela.
