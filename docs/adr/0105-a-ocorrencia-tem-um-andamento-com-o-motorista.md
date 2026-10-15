# ADR 0105 — A ocorrência tem um andamento com o motorista, separado da tratativa

- **Status:** proposta (2026-10-15). Escopo aprovado pelo Anderson no chat do projeto ("aprovado pode fazer"); falta a
  validação do `architect` (spec 266 T0.2) e a aprovação do PR.
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
2. **A tratativa encerrada resolve o andamento.** Quando a tratativa entra em `closed`, `returned_to_warehouse` ou
   `cancelled`, a mesma transação grava `resolved` com `actor_kind = system` e a nota da transição. O escritório também
   resolve direto, com observação obrigatória, qualquer ocorrência, com ou sem tratativa (`occurrences.resolve`).
3. **Só o motorista reabre, e só pelo app, respondendo.** A reabertura é **uma** rota que grava o evento `reopened` e a
   mensagem na conversa do motorista na mesma transação, criando a conversa se ela não existir.
   - Emenda à 183 D4: a mensagem do motorista numa ocorrência resolvida **reabre o andamento**. Ela continua sem decidir
     a tratativa, a taxa ou o acerto.
   - Emenda à 263 D4: a reabertura é o único caminho pelo qual o motorista **cria** a conversa da ocorrência.
   - Mensagem por WhatsApp ou e-mail não reabre.
4. **Ocorrência cancelada (167) não volta.** O andamento é exibido como "cancelada" e não aceita resolver nem reabrir.
5. **Publicação em etapas** (mesmo molde da 247): painel tolerante a estado e evento desconhecidos → API → telas.

## Consequências

- Duas noções convivem: a **tratativa** (decisão comercial, só para algumas ocorrências) e o **andamento** (conversa com o
  motorista, para todas). O painel mostra as duas e não deixa uma passar pela outra.
- A tratativa fechada pode ter andamento reaberto. Isso é intencional: o motorista avisa que algo mudou e o escritório
  decide se abre uma nova ocorrência. A tratativa continua fechada.
- O andamento precisa de leitura na rota do motorista e no feed do painel. O custo é uma consulta do último evento por
  ocorrência, com índice em `(company_id, occurrence_kind, occurrence_id, created_at DESC)`.
