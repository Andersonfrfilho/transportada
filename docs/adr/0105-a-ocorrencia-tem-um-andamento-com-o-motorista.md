# ADR 0105 — A ocorrência tem um andamento com o motorista, separado da tratativa

- **Status:** aceita (2026-10-15) — validada pelo architect na T0.2. Escopo aprovado pelo Anderson no chat do projeto
  ("aprovado pode fazer"); falta a aprovação do PR.
- **Data:** 2026-10-15
- **Nasce da spec 266:** o motorista precisa ver a ocorrência **resolvida** e poder **reabri-la** respondendo no chat,
  com tudo registrado em evento.
- **Emendas:** spec 183 D4 ("a conversa não decide") e spec 263 D4 ("o motorista não cria conversa de ocorrência"), cada
  uma num ponto só (§3 abaixo). A spec 167 ("reabrir tratativa está fora do escopo") **não** é emendada.

## Contexto

- A tratativa (`trip_occurrence_cases`) só existe quando a política de reentrega do tipo é `allowed`/`blocked`; a
  ocorrência de parada nunca abre tratativa. A maioria das ocorrências que o motorista registra não tem estado nenhum.
- A máquina da tratativa tem estados terminais protegidos por CHECK
  (`trip_occurrence_case_events_terminal_check`), e a spec 167 deixou a reabertura fora de escopo de propósito: a tratativa
  carrega decisão, acerto e cobrança da contratante.
- O motorista não quer saber da tratativa: quer saber se **o escritório deu o assunto por encerrado** e poder dizer
  "não acabou".

## Decisão

1. **Eixo próprio.** Uma tabela de eventos `trip_occurrence_resolution_events`, só de inserção, vale para ocorrência de
   **nota e de parada**: `kind` em `resolved | reopened` (VARCHAR + CHECK, sem ENUM nativo), `actor_kind` em
   `internal | driver | system`, nota, mensagem de origem e data. O estado do andamento é o **último evento**
   (sem evento = em aberto). A máquina da tratativa **não muda**: nenhum CHECK é afrouxado.
   - **Identidade sem polimorfismo.** Duas colunas, `document_occurrence_id` e `stop_occurrence_id`, cada uma com FK
     composta `(company_id, x) → (company_id, id)` `ON DELETE CASCADE` e `CHECK (num_nonnulls(...) = 1)` (mesmo molde do
     CHECK de dono único da spec 237). O contrato da API continua com `kind` + `id`.
   - **Ator rastreável.** O evento `system` aponta para o evento da tratativa que o causou (`case_event_id`, FK composta
     e único parcial). `actor_kind = 'system'` se, e só se, `case_event_id` existe e `actor_user_id` é nulo.
2. **A tratativa terminal resolve o andamento.** Em `applyTransition` (único escritor do status da tratativa), depois de
   gravar o evento da tratativa, a transição terminal (`closed`, `returned_to_warehouse`, `cancelled`; `decided` **não**
   é terminal) trava a ocorrência e grava `resolved` com `actor_kind = system`. Se já estiver resolvida, não duplica. O
   motorista vê uma **frase fixa por status terminal**, nunca a nota interna da tratativa. O escritório também resolve
   direto, com observação obrigatória (ela é lida pelo motorista), qualquer ocorrência, com ou sem tratativa
   (`occurrences.resolve`, permissão que já existe).
3. **Só o motorista reabre, e só pelo app, respondendo.** Não há rota nova: a resposta **existente** do motorista na
   conversa da ocorrência ganha `reopen?: true`. Na mesma transação, trava a ocorrência e grava `reopened` com a
   mensagem. No app a reabertura é explícita: o composer de uma ocorrência resolvida fica travado até o toque em
   "Reabrir".
   - Emenda à 183 D4: a mensagem do motorista numa ocorrência resolvida, enviada com `reopen`, **reabre o andamento**.
     Ela continua sem decidir a tratativa, a taxa ou o acerto. Resposta sem `reopen` (app antigo, WhatsApp) é gravada e
     não reabre.
   - Emenda à 263 D4: "o motorista só cria conversa de ocorrência respondendo" (o caminho já existe).
   - Mensagem por WhatsApp ou e-mail não reabre.
4. **Ocorrência cancelada (167) não volta.** O andamento é exibido como "cancelada" e não aceita resolver nem reabrir. Só
   a ocorrência de nota é cancelável; a tratativa cancelada pela própria ação `cancel` resolve a ocorrência como
   `system`, mas a ocorrência **não** fica cancelada.
5. **Lock.** Resolver, reabrir e a resolução automática travam a **linha da ocorrência** com `FOR NO KEY UPDATE` (mesmo
   molde do cancelamento da 167). O estado, inclusive `cancelled_at`, é lido **depois** do lock. A ordem é sempre
   tratativa → ocorrência. A T2.4 audita o caminho do cancelamento da 167.
6. **O motorista só vê enquanto a viagem não termina.** Lista, detalhe e links assinados somem depois de a viagem ser
   finalizada (404 no detalhe). `trip.occurrence-resolved` não é enviada se a viagem já terminou.
7. **Publicação em etapas** (mesmo molde da 247): painel tolerante a estado e evento desconhecidos → API → telas.

## Consequências

- Duas noções convivem: a **tratativa** (decisão comercial, só para algumas ocorrências) e o **andamento** (conversa com o
  motorista, para todas). O painel mostra as duas e não deixa uma passar pela outra.
- A tratativa fechada pode ter andamento reaberto. Isso é intencional: o motorista avisa que algo mudou e o escritório
  decide se abre uma nova ocorrência. A tratativa continua fechada.
- `case.transition` fica **fora** da linha do tempo do motorista (informação comercial, ADR-0045 §6). O motorista vê só
  `recorded`, `photo`, `cancelled` e `resolution.*`.
- O andamento precisa de leitura na rota do motorista e no feed do painel. O custo é uma consulta do último evento por
  ocorrência, com dois índices parciais `(company_id, x, created_at DESC, id)`, um por coluna de identidade.
