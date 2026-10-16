# ADR 0107 — O tipo de ocorrência tem escopo de contratantes

- **Status:** proposta (2026-10-16) — a validar pelo architect na T0.2 da spec 270. Pedido do Anderson no chat do projeto
  em 2026-10-16.
- **Data:** 2026-10-16
- **Nasce da spec 270:** cada tipo de ocorrência vale para todas as contratantes (padrão, o de hoje) ou só para uma lista
  escolhida.
- **Emenda:** a [ADR-0106](0106-o-email-da-ocorrencia-usa-modelo-do-cadastro.md) §2 (spec 269, ainda em `work/spec-269`):
  "O tipo continua geral — não é restrito a uma contratante" e a alternativa rejeitada "tipo restrito a contratante". O
  dono mudou de ideia no mesmo dia. O resto da ADR-0106 fica: o modelo efetivo continua sendo exceção da contratante ??
  tipo, e o escopo não muda essa conta.

## Contexto

- O tipo de ocorrência (`company_occurrence_types`) vale para toda nota. A exceção por contratante
  (`company_occurrence_type_contractor_overrides`, specs 218/246/247/248/269) **ajusta** campos do tipo para uma
  contratante, mas não tira o tipo das outras.
- A contratante de uma nota é a do CNPJ do emitente da NF-e, casado em `contractors (company_id, tax_id)` — único por
  empresa, então uma nota tem **no máximo uma** contratante (pode não ter nenhuma).
- O momento do registro (246: `separation`, `document`, `stop`, `office`) já é guardado num conjunto à parte
  (`company_occurrence_type_moments`) e cobrado em todo caso de uso que registra. A ocorrência de parada
  (`trip_stop_occurrences`) não tem nota; a parada pode ter notas de várias contratantes.
- As listas de tipos do motorista e do escritório recebem `contractorId` **pela query string**. Hoje isso só muda o que é
  exibido (exceção); para restringir, não pode ser confiado.

## Decisão

1. **Escopo explícito no tipo.** `company_occurrence_types.contractor_scope varchar(16) NOT NULL DEFAULT 'all'`, CHECK
   gerada da constante `OCCURRENCE_TYPE_CONTRACTOR_SCOPES = ['all', 'listed']` (sem ENUM nativo). Todo tipo existente
   fica `all`. Alternativa rejeitada: derivar "restrito" de lista não vazia — uma lista esvaziada por engano viraria
   "geral" em silêncio, abrindo o tipo para todos.
2. **Lista numa tabela de ligação.** `company_occurrence_type_contractors (company_id, occurrence_type_id,
contractor_id, created_at)`, PK nas três colunas, FK composta para o tipo `ON DELETE CASCADE` e para
   `contractors (company_id, id)` `ON DELETE RESTRICT` (igual à exceção; contratante não se apaga, só fica `inactive`).
   `listed` exige **ao menos uma** linha e `all` exige **nenhuma** — conferido pelo caso de uso na mesma transação, com o
   tipo travado `FOR UPDATE`. Alternativas rejeitadas: `uuid[]` no tipo (sem FK, sem isolamento por empresa); escopo como
   coluna da exceção (mistura "ajusta" com "restringe" e obrigaria uma linha de exceção por contratante só para liberar o
   tipo).
3. **O escopo vale onde há nota.** Todo registro com nota (motorista na entrega, escritório em nome do motorista, lote do
   escritório, galpão, fluxo do operador pelo WhatsApp, recebimento de carga) só aceita tipo `all` ou tipo `listed` com a
   contratante da nota na lista. Nota sem contratante identificada só aceita `all`. O registro de **parada** ignora o
   escopo; por isso um tipo cujo único momento é `stop` não pode ser `listed`.
4. **O servidor decide e recobra.** As listas de tipos filtram pelo escopo usando a contratante que **o servidor** lê da
   nota (`documentId`); o `contractorId` da query continua valendo só para a exceção (exibição). Sem nota e sem
   contratante, a lista traz só `all`. Todo caso de uso de registro com nota confere de novo e recusa com 422
   `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR` antes de gravar.
5. **Vale para registrar, não para ler.** Como o `active` (266), o escopo não esconde ocorrência já registrada em feed,
   detalhe, linha do tempo, relatório, tratativa, conversa nem na correção de itens (167/240), que não troca o tipo.
6. **Publicação em etapas** (ADR-0081 §9): painel tolerante às chaves novas do tipo → API → editor → passo de dados.

## Consequências

- Uma regra a mais em cada caso de uso de registro com nota, ao lado da guarda de momento da 246. A política é pura
  (`occurrence-type-contractor-scope.policy.ts`) e é a mesma na lista e no registro.
- Um registro feito offline antes da troca de escopo é recusado ao subir; o app mostra como as outras recusas.
- A exceção de uma contratante fora da lista fica guardada e sem efeito enquanto o tipo não valer para ela; o editor avisa.
- Um tipo `listed` some para as notas das outras contratantes **e** para as notas sem contratante identificada — quem
  restringe todos os tipos a uma contratante deixa as demais sem tipo de nota. O passo de dados da spec 270 (todos os
  tipos para a Spani) mede isso antes de gravar.
