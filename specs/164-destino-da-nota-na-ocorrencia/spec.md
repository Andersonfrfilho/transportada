# Feature 164 — O destino da nota na ocorrência

## Problema e resultado

A ocorrência hoje **só anota**. Está escrito no próprio schema
(`apps/api-transportada/src/database/trip.schema.ts:1421-1426`):

> ⚠️ **Ela só anota.** Não bloqueia transição e não muda `separation_status` — misturar o estado da
> nota com o que houve com ela deixaria o operador sem saída, porque **não existe tela de resolução
> de ocorrência**. Quando existir, é decisão nova, por escrito.

Esta spec é essa decisão por escrito.

O conferente acha a caixa violada, registra o tipo, marca os itens, fotografa (spec 161) — e o
registro morre ali. Ninguém decide se aquela nota ainda vai ser entregue. Ninguém pergunta ao dono
da carga se ele autoriza uma segunda viagem ou prefere ser ressarcido. O motorista que pagou o
produto no balcão não tem onde registrar quanto pagou. E o contratante, que é quem decide as duas
coisas, **não vê ocorrência nenhuma**: a projeção do portal
(`apps/api-transportada/src/contractor-portal/infrastructure/contractor-delivery.query.ts`) devolve
`accessKey, deliveredAt, documentId, estimatedArrivalAt, issuedAt, number, returnReason,
separationStatus, series, tripStatus` — o máximo que chega até ele é o `returnReason` de uma nota
já devolvida, depois de a decisão ter sido tomada sem ele.

O resultado desta feature:

1. **O tipo de ocorrência declara se aquele fato admite reentrega** — é propriedade do cadastro
   (`company_occurrence_types`), porque quem sabe se "avaria total" admite segunda tentativa é a
   transportadora, uma vez, não o conferente a cada registro.
2. **A ocorrência ganha uma tratativa com estado**, separada do fato: registrada → validação
   interna → (retorno ao barracão, que morre aqui dentro | enviada ao contratante) → decisão →
   encerrada.
3. **O contratante decide no portal dele**: autoriza a reentrega, paga os produtos que o motorista
   teve de pagar, ou registra outra solução — e o que ele decidiu fica gravado com nome, hora e
   motivo.
4. **A nota não é presa.** Ela continua disponível para todas as ações da listagem; o que aparece é
   um marcador derivado e um ícone de problema na parada do mapa — nunca um estado novo em
   `separation_status`.
5. **Reentrega autorizada propõe mover a entrega para o fim do roteiro**, e o usuário pode mudar a
   ordem depois.

## Fora do escopo

- **O e-mail à contratante.** Ele é a spec 143, e ela está aberta: `send-occurrence-mail.use-case.ts`
  **não existe** (T015 de `specs/143-a-contratante-responde-por-e-mail/tasks.md` segue `- [ ]`), e
  `company_occurrence_types.emails_contractor` é coluna sem nenhum leitor no código. O canal desta
  spec é o **portal** (ADR-0050). Quando a 143 fechar, o e-mail vira aviso de que há decisão
  pendente no portal — não um segundo caminho de decisão.
- **Ocorrência de parada** (`trip_stop_occurrences`, `kind` fechado). Ela já tem o próprio gancho
  financeiro (`unexpected_charge` → `delivery_charges`, spec 060 D4c) e outro público. Esta spec é
  da ocorrência **da nota** (`trip_document_occurrences`).
- **Emitir documento fiscal sobre o ressarcimento.** O demonstrativo da D14 não é CT-e nem NFS-e.
  Se a operação decidir cobrar isso com documento fiscal, é decisão de tributarista e spec nova.
- **Pagar de fato.** O produto registra que o ressarcimento foi feito (`reimbursed_at`); a
  transferência acontece fora do sistema, como todo pagamento do produto hoje.
- **Editar a ocorrência.** Ela continua append-only. A tratativa é tabela ao lado; corrigir o fato
  continua sendo registrar outro.
- **Reentrega como viagem nova automática.** A reentrega desta spec é decisão e reordenação; montar
  a viagem seguinte é o fluxo de montagem que já existe.

## Decisões

- **D1. A permissão de reentrega é do tipo, e nasce indefinida.** `company_occurrence_types` ganha
  `redelivery_policy` com três valores — `unset` (padrão), `allowed`, `blocked`. Booleano com
  default `false` diria "nenhum tipo admite reentrega" sobre um catálogo que ninguém revisou, e na
  manhã seguinte à migration toda ocorrência de galpão estaria escalando para o contratante. `unset`
  é o que o produto faz hoje: anota e para. A transportadora abre o cadastro e decide tipo a tipo,
  quando quiser.
  - Consequência: uma ocorrência de tipo `unset` **não abre tratativa**. Ela é o registro de hoje,
    inalterado, e as telas seguem mostrando o que já mostram.
- **D2. O fato é append-only; o estado mora ao lado.** `trip_document_occurrences` não ganha coluna
  de status. A tratativa é `trip_occurrence_cases` (uma linha por ocorrência), e cada mudança de
  estado grava `trip_occurrence_case_events` — um escritor só, na mesma transação, e só quando
  mudou. É o molde de `trip_status_events` (ADR-0068), e pela mesma razão: transição inferida de
  coluna é transição que ninguém consegue auditar depois.
- **D3. A máquina, por extenso.**

  ```
  recorded ─review─→ under_review ─keep_internal─→ returned_to_warehouse   (terminal, interno)
                                 └─send_to_contractor─→ awaiting_contractor
                                                          │
                                                   decide │
                                                          ↓
                                                       decided ─close─→ closed   (terminal)
  ```

  - `recorded` nasce junto da ocorrência, e só quando o tipo é `allowed` ou `blocked`.
  - **Toda transição é idempotente por desenho**: repetir a mesma ação no mesmo estado converge
    (`unchanged`), estado que não admite a ação responde 409 `OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED`
    — nunca 404 e nunca silêncio. Cópia da forma de `checkDeliveryChargeTransition`
    (`delivery-clients/domain/delivery-charge-state.policy.ts`), que é o precedente mais próximo:
    dinheiro entre duas empresas, com decisão externa no meio.
  - **`returned_to_warehouse` e `closed` não voltam.** Ressuscitar tratativa encerrada faria a mesma
    ocorrência chegar duas vezes ao contratante, com dois pedidos de decisão sobre o mesmo fato.

- **D4. O retorno ao barracão morre dentro da transportadora.** É o caminho de quando o problema se
  resolve no galpão: a caixa era outra, o item estava na prateleira ao lado, o conferente marcou
  errado. Ele fecha a tratativa **sem nunca criar visibilidade externa** — e é por isso que
  `returned_to_warehouse` sai de `under_review`, nunca de `awaiting_contractor`: depois que o
  contratante viu, esconder é reescrever o que ele já leu.
- **D5. A fronteira de visibilidade é da consulta, não da tela.** O portal lê por uma projeção
  própria (`contractor-occurrence.query.ts`) que faz `inner join` com `trip_occurrence_cases` e
  filtra `status in ('awaiting_contractor','decided','closed')` **dentro do SQL**, somada ao recorte
  de `ContractorScope` por `taxIds` que a ADR-0050 §4 já impõe. Tratativa `recorded`,
  `under_review` ou `returned_to_warehouse` não existe para o portal — não é escondida na
  renderização, não chega. Contrato negativo obrigatório, no molde de
  `test/*-schema/tenant-safety.contract.ts`.
- **D6. A decisão do contratante tem permissão própria: `occurrences.decide`.** Não sai de carona em
  `charges.decide` (ADR-0050 §6, "decidir repasse é dinheiro"): autorizar reentrega é **mandar o
  caminhão de volta**, compromisso operacional, e quem aprova repasse de taxa de doca não é
  necessariamente quem pode comprometer uma segunda viagem. A permissão entra no papel `contractor`
  e **em nenhum papel de dentro** — pela mesma razão que `deliveries.track` não entra: quem trabalha
  na transportadora decide pelo caminho interno, que é outro.
- **D7. A validação interna também tem permissão própria: `occurrences.resolve`.** `trip.manage` não
  serve, e a razão é o separador: ele **tem** `trip.manage` e é justamente quem registra a
  ocorrência de galpão. Validar a própria ocorrência seria autoaprovação, exatamente o modo de falha
  que a ADR-0067 evitou ao tirar o encerramento da viagem de `trip.manage`. `occurrences.resolve` vai
  para `company-admin`, `operator` e `finance`; não vai para `separator`, `driver` nem `aggregate`.
  `test/separator-role.contract.test.ts` lista as rotas alcançáveis por extenso e reprova se alguma
  delas aparecer lá.
- **D8. A nota não é presa, e isso é requisito, não omissão.** Nada em `trip_documents` muda:
  `separation_status` segue com os cinco valores de sempre, nenhuma ação some da listagem, o
  despacho não é bloqueado. O que a listagem ganha é um **marcador derivado** — "tem tratativa
  aberta" — calculado na leitura a partir de `trip_occurrence_cases`, e a parada ganha **ícone de
  problema** no mapa. Marcar estado na nota foi o desenho recusado na origem (`trip.schema.ts:1424`),
  e o pedido do usuário é o mesmo: a nota com ocorrência continua fazendo tudo.
- **D9. Reentrega autorizada propõe a reordenação; ela nunca acontece sozinha, e nunca depois do
  despacho.** `checkTripAcceptsLinkage` é a mesma porta de não-retorno de vincular, desvincular e
  reordenar (`reorder-trip-stops.use-case.ts:59`, ADR-0043 §2/§3). Viagem `dispatched` recusa a
  reordenação com 409 `STATE_TRANSITION_NOT_ALLOWED`, e a tratativa **registra a recusa** em vez de
  fingir que reordenou: a decisão do contratante fica gravada, a reentrega vira carga da próxima
  montagem, e a tela diz isso com todas as letras.
  - **A parada é que se reordena, e ela pode ter outras notas.** Quando a parada da nota carrega só
    ela, a proposta é mandá-la para o fim (`sequence` maior, pelo `PATCH /trips/:id/stops/order`
    que já existe, `trip.manage`). Quando carrega outras, mover a parada arrastaria entregas que
    não têm nada com a ocorrência — nesse caso a proposta é **liberar a nota** pelo mecanismo da
    spec 102 (marcar `released_at`, nunca apagar o vínculo) e devolvê-la ao pool. A ferramenta
    propõe; quem confirma é gente.
- **D10. O acerto é por item, e tem dois lados no mesmo lançamento.**
  `trip_occurrence_item_settlements` guarda uma linha por item: `amount numeric(14,4)` (nunca float
  binário), a origem do valor (`nfe` quando veio do `vUnCom` da nota, `manual` quando foi digitado),
  o ator que gravou — e **quem pagou**, que nem sempre é o motorista.
  - **`payer_kind` + `payer_id`**: `driver` (o caso mais comum, e o único que carrega `payer_id`
    apontando para `fleet_drivers`), `carrier` (a transportadora pagou do próprio caixa),
    `contractor` (a contratante pagou direto no balcão) e `insurer` (seguradora). `payer_id` é nulo
    nos três últimos: `carrier` é a própria instalação, e contratante e seguradora não têm cadastro
    de pessoa com quem casar hoje — inventar um só para preencher a coluna seria pior do que o nulo
    honesto. CHECK no banco: `(payer_kind = 'driver') = (payer_id is not null)`.
  - **Lado do crédito**: quem pagou tem direito a ressarcimento, e a linha carrega `reimbursed_at` +
    `reimbursed_by_user_id`. Quando `payer_kind = 'carrier'` o ressarcimento não existe — quem pagou
    é quem cobra —, e o CHECK garante que `reimbursed_at` fique nulo ali.
  - **Lado do débito**: o mesmo item vira cobrança à contratante (D12). São os dois lados do mesmo
    fato, não dois caminhos alternativos: o motorista adiantou dinheiro que a contratante deve.
  - O valor **proposto** é o do item na nota; ele é editável, e o que fica gravado é o acertado, com
    a origem ao lado — mesma regra da ADR-0044 §1 que o produto já aplica a peso e cubagem: número
    plausível sem marca de origem é o modo de falha.
- **D12. A cobrança à contratante reusa `delivery_charges`, com o menor acréscimo possível.** O
  trilho existe inteiro — `suggested → recorded → submitted → approved → reimbursed`
  (`delivery-charge-state.policy.ts`), decisão do contratante no portal, trilha append-only em
  `delivery_charge_events` com `decided_by_token` e `decided_by_message_id` — e `origin` **já tem o
  valor `'occurrence'`**, usado hoje pela ocorrência de parada (spec 060 D4c). Faltam duas coisas, e
  são as duas menores que resolvem:
  1. **um `charge_type` novo: `returned_goods`.** A lista de hoje (`unloading`, `scheduling`,
     `platform`, `parking`, `other`) é de **taxa de entrega**, e mercadoria devolvida não é taxa.
     Empurrá-la por `other` colapsaria as duas no mesmo relatório, que é exatamente o que a lista
     fechada da spec 060 D4 existe para impedir;
  2. **uma coluna `occurrence_id` (nulável) em `delivery_charges`**, com FK composta por
     `(company_id, occurrence_id)`. Sem ela, a linha de cobrança não acha a foto, o item nem a
     observação — e é justamente a evidência que faz o demonstrativo valer alguma coisa. As colunas
     `trip_id`/`trip_document_id` já existem e continuam preenchidas; a nova é o que amarra ao fato.
  - **A cobrança de ocorrência nasce `recorded`, nunca `suggested`.** `resolveInitialChargeStatus`
    reserva `suggested` ao que nasceu automático sem gente olhando; aqui um operador com
    `occurrences.resolve` acabou de digitar valor por valor, e pedir que ele confirme o que acabou de
    confirmar seria ruído. O `origin` continua `occurrence` — ele diz de onde veio, não quem olhou.
- **D13. O acúmulo mensal já existe, e não vai ganhar um segundo.** `extra_charge_batches` é, na
  própria palavra do schema, "do contratante e do período, nunca da viagem" (ADR-0048 §7): tem
  `period_start`/`period_end`, `total_amount numeric(14,4)`, `status` (`closed → submitted →
decided`), token da página pública e as rotas de decisão do portal já escritas
  (`contractor-extra-charges.use-case.ts`). A cobrança de ocorrência entra num lote **do mesmo
  contratante e do mesmo período** que as taxas de entrega, e a página mensal é a leitura desse lote
  quebrada por `charge_type`. Criar `occurrence_charge_batches` ao lado daria dois fechamentos, duas
  telas de aprovação e duas verdades sobre quanto aquele cliente deve no mês.
- **D14. O demonstrativo não é documento fiscal, e a spec diz isso em voz alta.** O que sai do
  fechamento é um **demonstrativo de ressarcimento** — a prestação de contas do que a transportadora
  adiantou. Ele:
  - **não é CT-e** (não tem chave de acesso, não vai à SEFAZ, não entra em `cte_*`);
  - **não é NFS-e** (não é serviço prestado, não vai à prefeitura, não entra em `nfse_*`);
  - **não entra em `billing_invoices`.** E isso não é preferência: `billing_invoice_items.cte_document_id`
    é `not null` — toda linha daquela fatura **é** um CT-e. Encaixar ressarcimento ali exigiria
    afrouxar a invariante que sustenta o faturamento do frete inteiro;
  - **não tem numeração fiscal nem sequência** (`fiscal_sequences` não é tocada), não gera obrigação
    acessória e não projeta imposto.
  - O que ele é: um PDF gerado com o `pdfkit` que a app **já tem**, no molde de
    `billing/infrastructure/invoice-pdf.gateway.ts` sobre uma política de layout própria — mesma
    separação de hoje (o layout é domínio puro e testável; o gateway só desenha). Nenhuma dependência
    nova. Se a operação quiser cobrar isso com documento fiscal, é decisão de tributarista e spec
    nova; o demonstrativo continua sendo a prova do que foi adiantado.
- **D15. A evidência é a foto da ocorrência, e isso dá um segundo motivo à retenção de cinco anos.**
  O demonstrativo leva, por linha: as **fotos** da ocorrência (spec 161, até cinco, original e
  miniatura), a **nota** (número, série, chave de acesso) e os **produtos** com valor por item. A
  spec 161 D9 justificou os cinco anos pela guarda fiscal e pela janela em que uma avaria ainda pode
  ser rediscutida; a partir daqui há um segundo motivo, e ele é mais duro: **a foto é anexo de uma
  cobrança**. Enquanto o demonstrativo daquele período for contestável, a imagem que o sustenta
  precisa existir. Os cinco anos cobrem o horizonte, e o expurgo continua apagando de verdade
  depois — mas a leitura do demonstrativo tem de sobreviver ao expurgo: linha com foto vencida sai
  com o selo "foto expirada (retenção de 5 anos)", nunca com imagem quebrada e nunca escondendo a
  cobrança.
- **D11. Retrocompatibilidade é o caso normal, não a exceção.**
  - Ocorrência **antiga** (antes desta migration) não tem tratativa, e não ganha uma por backfill:
    ela é o registro de um fato já encerrado na prática. As telas mostram "sem tratativa".
  - Tipo antigo fica `unset` e o produto não muda de comportamento ao aplicar a migration —
    nenhuma instalação passa a escalar ocorrência sozinha.
  - Viagem já **despachada** segue a D9: decide-se, registra-se, não se reordena.
  - O item da ocorrência vem de `trip_document_occurrence_products` quando há linha, e de
    `trip_document_occurrences.product_code` quando não há (`resolveOccurrenceProductCodes`,
    `trips/domain/occurrence-scope.policy.ts`) — o acerto usa a mesma derivação, nunca uma terceira.
    ⚠️ A seleção de **vários** itens por ocorrência está em curso nesta mesma árvore, não commitada
    (`drizzle/20260922164534_trip_document_occurrence_products/`,
    `drizzle-occurrence-product.repository.ts`, `occurrenceProductSelection.service.ts`). O acerto
    por item funciona com um item só e cresce sozinho quando ela fechar — mas **a T13 não começa
    antes dela estar commitada**, ou as duas mexem na mesma leitura ao mesmo tempo.

## Histórias priorizadas

### P1 — O tipo diz se cabe reentrega

**Given** alguém com `settings.manage` no cadastro de tipos de ocorrência **When** marca um tipo
como "admite reentrega" **Then** toda ocorrência nova daquele tipo nasce com tratativa aberta, e os
tipos que ninguém tocou seguem `unset`, anotando como antes.

### P1 — O escritório valida antes de o cliente ver

**Given** uma tratativa `recorded` de um tipo com política definida **When** quem tem
`occurrences.resolve` abre a página de ocorrências e coloca a tratativa em validação interna
**Then** ela vai a `under_review`, e o contratante continua sem ver nada.

### P1 — O que se resolve no galpão não sai do galpão

**Given** uma tratativa `under_review` **When** o escritório registra retorno ao barracão com motivo
**Then** ela vai a `returned_to_warehouse`, encerra ali, e **nenhuma consulta do portal a alcança** —
nem depois, nem por engano de filtro.

### P1 — O contratante decide

**Given** uma tratativa `awaiting_contractor` de uma nota amarrada à conta do contratante **When**
ele abre o portal e escolhe autorizar a reentrega, pagar os produtos ou outra solução, com motivo
**Then** a tratativa vai a `decided`, a decisão fica gravada com o `userId` dele, a hora e o texto, e
a transportadora vê isso na página de ocorrências.

### P1 — Reentrega autorizada empurra a entrega para o fim

**Given** uma reentrega autorizada numa viagem que ainda aceita mudança de roteiro **When** o
operador confirma a proposta **Then** a parada da nota vai para o fim do roteiro, a rota é
recalculada, e ele pode reordenar manualmente depois.

### P1 — Viagem despachada decide, mas não reordena

**Given** a mesma autorização numa viagem `dispatched` **Then** a decisão é gravada, a reordenação é
recusada com 409 `STATE_TRANSITION_NOT_ALLOWED`, e a tela diz que a reentrega entra na próxima
montagem.

### P2 — A nota com ocorrência continua trabalhando

**Given** uma nota com tratativa aberta **When** o operador abre a listagem da viagem **Then** todas
as ações continuam disponíveis, a nota aparece com um marcador de tratativa aberta, e a parada dela
tem ícone de problema no mapa.

### P2 — O que o motorista pagou fica registrado

**Given** uma decisão de pagamento dos produtos **When** o escritório registra o valor por item e o
motorista que pagou **Then** cada item guarda valor, origem do valor e ator, e o total aparece na
tratativa.

### P2 — O mês fecha e vira demonstrativo

**Given** um contratante com ocorrências acertadas no período **When** o financeiro abre
"Ressarcimentos" e fecha o lote do mês **Then** vê o acumulado por tipo, e baixa um demonstrativo em
PDF com as notas, os produtos, os valores e as **fotos** das ocorrências — um documento que diz, nele
mesmo, que não é documento fiscal.

### P2 — Quem pagou é ressarcido

**Given** um acerto em que o motorista pagou os produtos **When** o contratante aprova a cobrança e o
financeiro registra o ressarcimento **Then** cada item guarda quem foi ressarcido e quando, e a linha
da transportadora (`carrier`) recusa o registro de ressarcimento — quem pagou é quem cobra.

### P3 — A tratativa encerra

**Given** uma tratativa `decided` **When** quem tem `occurrences.resolve` a encerra **Then** ela vai
a `closed`, o marcador some da listagem e do mapa, e o histórico continua legível para sempre.

## Requisitos funcionais

### Cadastro e abertura

- RF1. `company_occurrence_types` ganha `redelivery_policy` (`unset` | `allowed` | `blocked`,
  padrão `unset`, CHECK no banco). `GET`/`PUT /company-settings/occurrence-types` passam a ler e
  gravar o campo; ausente no `PUT` **não** altera o valor guardado.
- RF2. `trip_occurrence_cases`: uma linha por ocorrência, `status`, `redelivery_policy` copiado do
  tipo **no momento do registro** (renomear ou reclassificar o tipo depois não reescreve tratativa
  aberta), `opened_at`, `closed_at`, `decision_kind`, `decision_note`, `decided_by_user_id`,
  `decided_at`, `company_id` em toda FK composta.
- RF3. Registrar ocorrência de tipo `allowed` ou `blocked` abre a tratativa em `recorded`, **na
  mesma transação** do registro. Tipo `unset` não abre tratativa, e nada no fluxo de hoje muda.
- RF4. `trip_occurrence_case_events` é append-only: `from_status` (nulo na abertura), `to_status`,
  `actor_user_id`, `actor_kind` (`internal` | `contractor`), `occurred_at`, `note`. Escritor único,
  na mesma transação da mudança, e só quando mudou.

### Máquina e rotas internas

- RF5. `POST /trip-occurrences/:id/case/review` → `under_review`. Permissão `occurrences.resolve`.
- RF6. `POST /trip-occurrences/:id/case/warehouse-return` → `returned_to_warehouse`, `note`
  obrigatória. Permissão `occurrences.resolve`. Só de `under_review`.
- RF7. `POST /trip-occurrences/:id/case/contractor-submission` → `awaiting_contractor`. Permissão
  `occurrences.resolve`. Só de `under_review`. Recusa com 422
  `OCCURRENCE_CASE_REDELIVERY_BLOCKED_HAS_NO_QUESTION` quando a tratativa é `blocked` **e** não há
  item para acertar — não há o que perguntar ao contratante.
- RF8. `POST /trip-occurrences/:id/case/closure` → `closed`, só de `decided`. Permissão
  `occurrences.resolve`.
- RF8b. `POST /trip-occurrences/:id/case/cancel` → `cancelled`, `note` obrigatória. Permissão
  `occurrences.resolve`. Só de `recorded`/`under_review` — depois de enviada ao contratante, a
  máquina recusa com 409. **Esta rota nasceu na Fase 2 (T7)**, de uma decisão do usuário posterior
  a esta spec: o estado terminal `cancelled` e a ação `cancel` já existiam na máquina desde a T2
  ("ocorrência aberta por engano"), mas a spec original não previa rota para alcançá-lo — a lacuna
  era da spec, não uma decisão de deixar `cancel` fora das rotas.
- RF9. Toda transição é idempotente pela chave `(occurrenceId, action, ator)`; repetir converge.
  Estado incompatível → 409 `OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED`, com a transição pretendida na
  mensagem e **sem PII**.
- RF10. `GET /trip-occurrences` (feed, `fleet.read`) passa a devolver a tratativa junto de cada
  ocorrência: `case: null | { status, redeliveryPolicy, decision, settlementTotal, updatedAt }`.
  Ocorrência sem tratativa devolve `null` — nunca um estado inventado.
- RF11. Filtro por estado da tratativa na página de ocorrências, incluindo "sem tratativa".

### O contratante

- RF12. Permissão `occurrences.decide`, no papel `contractor` e em nenhum papel interno.
- RF13. `GET /client-occurrences` (`deliveries.track`): as ocorrências das notas do escopo do
  contratante **cuja tratativa está em `awaiting_contractor`, `decided` ou `closed`**, com tipo,
  observação, itens, fotos (URL assinada de curta duração, mesmo molde da spec 161) e a decisão, se
  houver. O filtro é `inner join` na consulta, nunca condicional de tela.
- RF14. `POST /client-occurrences/:id/decision` (`occurrences.decide`): corpo
  `{ kind: 'redelivery_authorized' | 'goods_paid' | 'other', note }`. `note` obrigatória em `other`.
  Só de `awaiting_contractor`; repetir a mesma decisão converge; decisão diferente sobre tratativa
  já `decided` → 409. A trilha grava o `userId` do contratante (ator externo com nome, ADR-0050 §2).
- RF15. A rota **não recebe** id de contratante, CNPJ nem `companyId` — o escopo sai da conta, como
  em todo o portal.
- RF16. `redelivery_authorized` sobre tratativa `blocked` → 422
  `OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED`: o tipo diz que aquele fato não admite segunda tentativa,
  e o portal não é lugar de contornar o cadastro da transportadora.

### Roteiro e nota

- RF17. `GET /trip-occurrences/:id/case/redelivery-proposal` (`occurrences.resolve`) devolve a
  proposta: `{ kind: 'reorder_stop' | 'release_document' | 'refused', stopId?, reason? }`.
  `reorder_stop` quando a parada só tem a nota da ocorrência e a viagem aceita mudança de roteiro;
  `release_document` quando a parada carrega outras notas; `refused` com motivo quando
  `checkTripAcceptsLinkage` recusa.
- RF18. Aplicar a proposta é o caminho que já existe — `PATCH /trips/:id/stops/order` (`trip.manage`)
  ou a liberação da nota — **nunca uma escrita nova em `trip_stops`**. A tratativa registra qual
  proposta foi aplicada, por quem e quando, e registra a recusa quando houve.
- RF19. Nenhuma escrita em `trip_documents`: `separation_status`, `released_at` por causa da
  ocorrência (fora da RF18 confirmada por gente), `delivered_at` e `returned_at` seguem com os
  mesmos escritores de hoje.
- RF20. A leitura da viagem (`readTripDetail` e a listagem de notas) devolve, por nota,
  `openOccurrenceCase: boolean` derivado — e **nenhuma ação da nota muda por causa dele**.
  `GET /trips/:id/allowed-actions` fica byte a byte igual: contrato de regressão obrigatório.
- RF21. A leitura de paradas devolve `hasOpenOccurrence: boolean` por parada, para o ícone do mapa.

### Acerto, cobrança e demonstrativo

- RF22. `trip_occurrence_item_settlements`: `occurrence_id`, `product_code`, `amount numeric(14,4)`,
  `amount_source` (`nfe` | `manual`), `payer_kind` (`driver` | `carrier` | `contractor` | `insurer`),
  `payer_id` (só em `driver`, FK composta para `fleet_drivers` **com índice ao lado**),
  `reimbursed_at`, `reimbursed_by_user_id`, `recorded_by_user_id`, `created_at`. Unique
  `(company_id, occurrence_id, product_code)` — um acerto por item, nunca dois.
- RF23. `PUT /trip-occurrences/:id/case/settlement` (`occurrences.resolve`) grava a lista inteira de
  uma vez (substitui, não acumula), só com tratativa em `decided` e `decision_kind = 'goods_paid'`.
  Item fora da ocorrência → 422. Valor `<= 0` → 422. `payer_kind: 'driver'` sem `payer_id`, ou
  qualquer outro **com** `payer_id` → 422 `OCCURRENCE_SETTLEMENT_PAYER_INVALID`.
- RF24. O valor proposto por item vem do item na nota; a resposta diz a origem de cada valor.
- RF25. Gravar o acerto **cria ou atualiza**, na mesma transação, uma linha de `delivery_charges`
  com `origin: 'occurrence'`, `charge_type: 'returned_goods'`, `occurrence_id` preenchido, `amount`
  igual à soma dos itens (`Decimal`) e status inicial `recorded`. Regravar o acerto atualiza o valor
  da mesma linha enquanto ela estiver `recorded`; linha já `submitted` ou além é **imutável** e a
  regravação responde 409 `DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED` — o valor já foi ao contratante.
- RF26. `charge_type` ganha o valor `returned_goods` (lista fechada + CHECK ampliado), e
  `delivery_charges` ganha `occurrence_id` nulável com FK composta. Migration aditiva: nenhuma linha
  existente muda.
- RF27. O fechamento mensal é o `extra_charge_batches` que já existe — a cobrança de ocorrência entra
  no lote do **mesmo contratante e período** das taxas de entrega, pelo caminho de fechamento atual.
  Nenhuma tabela de lote nova.
- RF28. `GET /occurrence-charges/report` (`trip.financials`): o relatório mensal por contratante —
  período, total, quebra por `charge_type`, e as linhas de `returned_goods` com nota, itens,
  contagem de fotos e o estado da cobrança. Cursor no mesmo formato do resto do produto.
- RF29. `GET /extra-charge-batches/:id/statement` (`trip.financials`) devolve o **demonstrativo de
  ressarcimento** em PDF: cabeçalho da transportadora e do contratante, período, linhas com nota,
  produtos e valores, o total, e as **fotos** das ocorrências como evidência. Gerado com o `pdfkit`
  que a app já tem, no molde de `invoice-pdf.gateway.ts` (layout como política pura + gateway que só
  desenha). Anexo vencido entra como selo textual, nunca como imagem quebrada.
- RF30. O demonstrativo carrega, visível no próprio documento, a frase de que **não é documento
  fiscal** — não é CT-e, não é NFS-e, não substitui nota e não tem numeração fiscal.
- RF31. O ressarcimento de quem pagou é marcado por item
  (`POST /trip-occurrences/:id/case/settlement/reimbursement`, `occurrences.resolve`), idempotente,
  e recusado com 422 quando `payer_kind = 'carrier'`. Nada além de `reimbursed_at` e
  `reimbursed_by_user_id` é escrito — pagar de fato acontece fora do sistema.

### Telas

- RF32. Página **"Ressarcimentos"**, por contratante e por mês: o acumulado do período, a quebra por
  tipo de cobrança, a lista das ocorrências que entraram com miniatura da foto, e o botão que baixa
  o demonstrativo da RF29. Permissão `trip.financials` — dinheiro tem permissão própria (spec 061
  D4), e quem valida ocorrência não necessariamente vê valor.
- RF33. Página `/ocorrencias` ganha a coluna de estado da tratativa, o filtro da RF11 e o painel de
  tratativa na linha expandida: a máquina com o passo atual, os botões permitidos pelo estado e pela
  permissão, e o histórico de eventos.
- RF34. O painel de acerto por item, com valor proposto editável, origem visível e o motorista que
  pagou. Dinheiro formatado em pt-BR, `Decimal` do começo ao fim.
- RF35. `apps/frontend-client`: tela "Ocorrências", com foto, itens, observação e os três botões de
  decisão, cada um pedindo motivo quando é `other`. Sem design system, CSS próprio e campos nativos,
  como as três páginas que já existem lá.
- RF36. Listagem de notas da viagem: marcador de tratativa aberta, **sem** esconder ou desabilitar
  ação nenhuma.
- RF37. Mapa: ícone de problema na parada com tratativa aberta, sobre a cor de identidade que
  `stopColorOf` já calcula — o ícone acrescenta, não substitui.
- RF38. Textos em `trip.locale.json` e `trip.en.locale.json` (e nos textos próprios do portal):
  estados, ações, motivos de recusa, a frase da viagem despachada e o aviso de proposta de liberação.

## Requisitos não funcionais

- RNF1. `companyId` em toda FK composta e em todo filtro de repositório. Contrato de isolamento
  entre empresas obrigatório em cada consulta nova (`test/*-schema/tenant-safety.contract.ts`).
- RNF2. Log sem PII: nada de nome do destinatário, telefone, CNPJ, valor por item ou texto de
  observação. Id opaco e contador.
- RNF3. As rotas de decisão e de acerto declaram `rateLimit` no Postgres e aparecem em
  `test/rate-limited-routes.contract.test.ts`.
- RNF4. Migration aditiva, com `rollback.sql` ao lado e `snapshot.json`. `db:generate` devolve
  `no_changes` depois de aplicada.
- RNF5. Nenhuma consulta nova sem índice que a sirva; `explain` registrado na evidência da task de
  integração.

## Casos extremos e falhas

- Ocorrência de tipo `unset` — nenhuma tratativa, nenhum botão, nenhuma linha no portal.
- Ocorrência antiga sem tratativa — feed e painel devolvem `case: null`, a tela diz "sem tratativa".
- Tipo renomeado ou reclassificado depois do registro — a tratativa mantém o `redelivery_policy` que
  copiou; o cadastro novo vale para ocorrência nova.
- Tipo aposentado (`active: false`) com tratativa aberta — a tratativa segue seu curso.
- Viagem cancelada com tratativa aberta — a tratativa continua e pode ser encerrada; a proposta de
  reentrega devolve `refused`.
- Nota liberada da viagem (`released_at`) com tratativa aberta — o feed continua mostrando; a
  proposta devolve `refused`.
- Contratante sem vínculo com a nota — `GET /client-occurrences` não a devolve, e o `POST` da
  decisão responde **404**, nunca 403: quem não alcança o recurso não descobre que ele existe.
- Duas abas do portal decidindo ao mesmo tempo — `select … for no key update` na tratativa antes do
  `update`, compare-and-set por status; a corrida perdida responde 409.
- Ocorrência sem item (`product_code` vazio, nota inteira) — o acerto por item fica vazio, e
  `goods_paid` exige pelo menos um item: 422 `OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS`.

## Critérios de aceite

- CA1. Migration aplicada não muda comportamento nenhum: todo tipo existente fica `unset`, nenhuma
  tratativa nasce, e a suíte de contrato de ocorrência de hoje passa sem alteração.
- CA2. Contrato da máquina: cada transição legal, cada ilegal com o código certo, idempotência de
  todas elas, e `returned_to_warehouse`/`closed` sem saída.
- CA3. Contrato negativo do portal: tratativa `recorded`, `under_review` e `returned_to_warehouse`
  **não aparecem** em `GET /client-occurrences`, e o `POST` da decisão sobre elas responde 404.
- CA4. Contrato de isolamento: ocorrência de outra empresa é 404 em toda rota nova; contratante de
  outra empresa não alcança nada.
- CA5. Regressão de `GET /trips/:id/allowed-actions` e do gating de ações: nenhuma diferença com
  tratativa aberta. O teste falha se alguma ação sumir.
- CA6. Reentrega numa viagem `dispatched`: decisão gravada, proposta `refused`, `trip_stops`
  intocada — provado por leitura da tabela, não por ausência de erro.
- CA7. Reentrega numa viagem editável com parada de uma nota só: `sequence` vira o maior da viagem,
  a rota é recalculada, e o evento da tratativa registra o que foi aplicado.
- CA8. Parada com outras notas: a proposta é `release_document`, e nada é aplicado sem confirmação.
- CA9. Acerto: valores por item com `numeric(14,4)`, soma conferida com `Decimal`, origem de cada
  valor na resposta, item fora da ocorrência recusado, valor `<= 0` recusado.
- CA9b. Pagador: `driver` exige `payer_id`; `carrier`, `contractor` e `insurer` recusam `payer_id`;
  o CHECK do banco reprova a linha inválida mesmo se o caso de uso deixar passar.
- CA9c. Cobrança: gravar o acerto cria **uma** linha de `delivery_charges` com
  `origin: 'occurrence'`, `charge_type: 'returned_goods'`, `occurrence_id` preenchido e status
  `recorded`; regravar atualiza a mesma linha; linha `submitted` ou além recusa com 409 e o valor
  **não** muda — provado por leitura da tabela.
- CA9d. Demonstrativo: o PDF sai com as linhas, os produtos, os valores, o total conferido com
  `Decimal` e as fotos; foto vencida vira selo textual; o documento carrega a frase de que não é
  documento fiscal; **nada** é escrito em `billing_*`, `cte_*`, `nfse_*` ou `fiscal_sequences` —
  provado por leitura das tabelas depois do teste.
- CA9e. Ressarcimento: idempotente; `payer_kind = 'carrier'` recusa com 422; nada além de
  `reimbursed_at`/`reimbursed_by_user_id` é escrito.
- CA10. Integração contra Postgres: a máquina inteira sobre as mesmas linhas, com as duas consultas
  (feed interno e portal) exercitadas e o isolamento por empresa dentro do teste.
- CA11. `test/separator-role.contract.test.ts` continua verde e **não** lista nenhuma rota nova.
- CA12. Nenhum log com observação, valor, nome ou documento — grep na evidência.
- CA13. Prints em 390×844 e 1440×900, claro e escuro, das três superfícies: página de ocorrências
  com a tratativa, painel de acerto, e o portal do contratante decidindo.

## Segurança e LGPD

- O portal é superfície externa: a projeção é enumerada campo a campo, como
  `contractor-delivery.query.ts` — nunca `select *`, nunca a linha da ocorrência inteira.
- A foto da ocorrência chega ao contratante por URL assinada de 5 minutos, gerada só na leitura de
  detalhe, sem `objectKey` nem `bucket` na resposta (spec 161 RF8).
- O texto da observação pode conter o que o conferente escreveu — ele **não** entra em log, em
  métrica nem em mensagem de erro.
- A trilha da decisão externa grava o `userId` do contratante, e é ela que responde "qual pessoa do
  cliente autorizou a segunda viagem".
- O demonstrativo em PDF carrega foto, número de nota e valor — ele é gerado sob autenticação, com
  `trip.financials`, e **nunca** é servido por link anônimo. O token público de
  `extra_charge_batches` abre o lote, não o demonstrativo com evidência.
- A retenção de cinco anos das fotos (spec 161 D9) ganha um segundo motivo: **a foto é anexo de uma
  cobrança**. Reduzir esse prazo passa a exigir também a pergunta "e o demonstrativo do período
  contestado?", não só a da guarda fiscal.
- Entrada nova em `docs/SECURITY.md` com a data, a superfície nova e o que ficou aberto.

## Respostas do usuário — 2026-09-22

As duas perguntas que bloqueavam esta spec foram respondidas, e as respostas estão incorporadas
acima. Ficam registradas aqui porque elas explicam decisões que o código sozinho não justifica:

1. **O destino contábil é os dois lados, com relatório próprio.** O valor vira cobrança à contratante
   **e** fica ligado ao ressarcimento de quem pagou — não são caminhos alternativos (D10, D12). O
   acúmulo é mensal, por contratante, e dele sai uma fatura para enviar, com as evidências: fotos da
   devolução que voltou no caminhão, notas e produtos (D13, D14, D15). Modelado sobre
   `delivery_charges` + `extra_charge_batches` + o `pdfkit` que a app já tem; o que faltava e foi
   acrescentado são **duas coisas**: o `charge_type` `returned_goods` e a coluna `occurrence_id` em
   `delivery_charges`.
2. **O pagador nem sempre é o motorista.** `(payer_kind, payer_id)` com `driver` (o caso comum),
   `carrier`, `contractor` e `insurer` (D10).

Não há `[NEEDS CLARIFICATION]` aberto nesta spec.
