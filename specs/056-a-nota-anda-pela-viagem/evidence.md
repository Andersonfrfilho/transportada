# 056 — A nota anda pela viagem · evidências

Uma entrada por task concluída: comando executado, saída relevante e o que ela prova. Detalhe
completo de cada task está em `tasks.md`, na própria entrada da task — este arquivo é o resumo
que se lê de uma vez.

| Task  | Comando                                                                                   | Resultado                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T001–T009 | `bun run --cwd apps/api-transportada test` ao fim de cada task | modelo de dados, máquina de estado pura, normalização de endereço, transições individual e em lote — construídos em sessões anteriores, cada task com evidência própria em `tasks.md` |
| T010 | `bun run --cwd apps/api-transportada test` | `planTripRoute`/`dispatchTrip` prontos: `hasRoute` exige ≥1 parada e nenhuma nota sem parada; despachar com pendência recusa por padrão (`409 TRIP_HAS_UNLOADED_DOCUMENTS`) e só aceita com `force`+motivo, devolvendo as pendentes ao pool |
| T010b | probe ao vivo contra Postgres local (removido depois) | `delivery_address_overrides` (append-only) registra dois desvios em sequência para a mesma nota: o primeiro grava o destinatário original da NF-e como "anterior", o segundo grava o primeiro desvio como "anterior" dele — histórico ordenado, mais recente primeiro |
| T010c | probe ao vivo contra Postgres local (removido depois) | `GET /trip-documents/returned-with-active-cte`: lista vazia para nota devolvida sem CT-e; uma entrada com a chave de acesso certa depois de autorizar o CT-e da mesma nota. Teste negativo: o port que a transição de nota consome não tem, na sua forma, nenhum método que toque CT-e |
| T011 | `bun run --cwd apps/api-transportada test` | permissão `trip.manage`/papel `separator` (entregue pela spec 055, confirmado presente na árvore) |
| T012 | `bun run --cwd apps/api-transportada test` | as sete rotas de estado (separate/load/return/batch-status/plan-route/dispatch/cancel) mais `GET /trips/:id/stops` publicadas, sob `trip.manage`/`fleet.read` |
| T012b | probe ao vivo contra Postgres local (removido depois) | **achado ao começar o T018:** `reconcileStopOnLink`/`reconcileStopOnUnlink` (T007) nunca tinham sido ligados a `linkDocument`/`releaseDocument` reais — nenhuma nota vinculada por uma viagem de verdade ganhava `stop_id`, e `plan-route` nunca conseguia sair de `hasRoute: false`. Corrigido: duas notas no mesmo CEP/número/município reaproveitam a mesma parada, endereço diferente cria outra, liberar a única nota de uma parada a apaga |
| T013 | `bun run --cwd apps/api-transportada test` | vínculo e desvínculo recusam viagem despachada (`409 STATE_TRANSITION_NOT_ALLOWED`) via `SELECT ... FOR UPDATE`, fechando a corrida com um despacho concorrente — verificado ao vivo contra Postgres |
| T014 | `bun run --cwd apps/api-transportada test:integration` | `GET /trips/:id` devolve notas aninhadas por parada em **4 selects fixos**, provado comparando 1 parada/1 nota com 40 paradas/200 notas — mesma contagem nas duas |
| T014b | `bun run --cwd apps/api-transportada test` | `PATCH /trips/:id/stops/order`: RF-6 listava a rota desde o início da spec, nenhuma task a tinha implementado. Reordenação verificada ao vivo (5 paradas invertidas de ponta a ponta, sem violar a unique de sequência) |
| T015 | `bun run --cwd apps/frontend-transportada test` · `build` | `TripDetail` agrupa por parada com arraste (`@dnd-kit`), maço de seleção e barra de progresso por fase; frontend inteiro migrado do contrato pré-ADR-0043 |
| T015b | `bun run --cwd apps/frontend-transportada test` · `build` | menu de desvio de entrega (D9): formulário com endereço novo, solicitante (texto livre) e motivo, mais histórico carregado ao abrir |
| T016 | `bun run --cwd apps/frontend-transportada test` · `build` | ações de separar/carregar/devolver por nota e em lote; diálogo de força no despacho calcula as pendentes direto de `trip.documents`, sem round-trip pelo erro |
| T017 | `bun run --cwd apps/frontend-transportada test` · `build` | auditoria: `trip.module.css` já cumpria a regra dos quatro pontos de quebra (contrato global `responsive.contract.ts`); nenhum código novo precisou de correção |
| T018 | `DATABASE_URL=… bun run --cwd apps/api-transportada test:integration` | ciclo inteiro contra Postgres real: criar → vincular 3 notas em 2 endereços → planejar → separar → carregar → despachar → snapshot congelado com a distribuição certa (`[1, 2]`) → vínculo selado (`409`/`null`) → tenant negativo (`null`, nunca `403`) |

## Desvios do caminho descrito, registrados por task

Quatro tasks nomeavam caminho de arquivo, comando de verificação ou infraestrutura que não existe
neste repositório. Em todos os casos o desvio está documentado na própria entrada da task em
`tasks.md`, com a justificativa; resumo aqui:

| Task | O que a task nomeava | O que existe de fato | Por quê |
| ---- | --------------------- | --------------------- | ------- |
| T014 | `docs/frontend/detail-query-count` implícito num contrato próprio | `test/integration/trip-detail-query-count.integration.ts`, com `Proxy` contando `.select()` | segue o padrão real de prova viva já estabelecido (`withDisposableDatabase`) |
| T015/T015b/T016 | `src/modules/trip/mutations/*.mutation.ts` | tudo em `useTripWorkspace.hook.ts` | nenhum outro caminho do frontend usa uma pasta `mutations/` — seguir o nome sugerido fragmentaria o mesmo padrão em dois lugares |
| T017 | `docs/frontend/responsiveness.md` (novo) | `docs/frontend/responsive.md` já existe, com contrato global que já cobria `trip.module.css` | criar um segundo documento com nome quase igual fragmentaria a mesma regra |
| T018 | `test/e2e/trip-lifecycle.e2e.ts`, `env.test.e2e`, `make test-e2e` | `test/integration/trip-lifecycle.integration.ts`, registrado em `test:integration` | nenhuma dessas três coisas existe em lugar nenhum do repositório — construir a camada é projeto de infraestrutura à parte, não escopo de uma feature |

## Achados fora do escopo original, corrigidos no caminho

| Achado | Onde apareceu | O que foi feito |
| ------ | -------------- | ---------------- |
| Reconciliador de parada nunca ligado ao vínculo real | Início do T018 (E2E não conseguia planejar rota) | Corrigido como T012b — ver tabela acima |
| `PATCH /trips/:id/stops/order` nunca implementada | Início do T015 (frontend não tem como reordenar sem a rota) | Corrigido como T014b — ver tabela acima |
| `delivery_address_overrides` (D9) nunca implementada | Início do T015b (menu de desvio sem backend) | Corrigido como T010b — ver tabela acima |
| Bug de corrida em `drizzle-trip.repository.ts` (edição interrompida por compactação de contexto) | Retomada da sessão, antes do T013 | `linkDocument` chamava função inexistente e lançava o erro semanticamente errado; corrigido antes de qualquer teste rodar |

## Revisão final (opus) — dois bugs achados e corrigidos

A revisão rodou depois de todas as tasks fecharem, contra a suíte inteira **verde**. Os dois bugs
abaixo passavam por ela sem tocar em nada, e a razão é estrutural: os contratos do frontend deste
repositório leem texto de fonte ou exercitam serviço puro, e **nenhum renderiza**. Bug de ciclo de
render e botão oferecido no estado errado são, por construção, invisíveis aqui.

| Achado | Severidade | Como se manifestava | Correção |
| ------ | ---------- | -------------------- | -------- |
| Laço infinito de render no diálogo de desvio de endereço | alta — trava a aba e martela a API | `loadHistory` chega como closure nova a cada render de `TripDetail` (o controlador de `useTripWorkspace` é reconstruído todo render, então **nada nele é referencialmente estável**); `refreshHistory` era `useCallback(..., [input.loadHistory])`; o `useEffect` de carregar o histórico dependia de `refreshHistory`. Com o diálogo aberto: efeito → `setState` → render → nova closure → efeito | referência (`useRef`) guarda a versão mais recente de `loadHistory` fora da identidade da função; `refreshHistory` volta a ser estável e o efeito só dispara quando `isOpen`/`documentId` mudam |
| Portão de "Devolver" invertido | alta — a ação principal do fluxo de retorno era inalcançável | o domínio trata `return`/`deliver` como **trabalho de rua** (`checkTripAcceptsDocumentWork` exige `isTripDispatched`), e `separate`/`load` como trabalho de barracão (proibido a partir de `dispatched`, e também em `draft`). O frontend prendeu os três a um `isTripEditable` só — que é o **inverso** do portão de rua. Resultado: "Devolver" (por nota e em lote) aparecia só antes do despacho, exatamente quando dá `409 TRIP_NOT_DISPATCHED`, e sumia depois, exatamente quando funcionaria. Ainda era oferecido para nota `separated`, que `checkDocumentOrigin` recusa com `documentNotLoaded` | três portões distintos em `tripStatus.service.ts` (`isTripEditable`, `canSeparateOrLoadDocuments`, `canReturnDocuments`), cada um espelhando um ramo da política; devolver restrito a `loaded` |

**O que impede a repetição:** `test/trip/state-gates.contract.ts` transcreve a tabela
estado → portão de `checkTripAcceptsDocumentWork` e a compara com as três funções do frontend, mais
uma invariante direta ("devolver e separar nunca abrem no mesmo estado"). Verificado que ele falha
nos três pontos com o bug restaurado, e passa com a correção.

### Risco latente, registrado e não corrigido

`listReturnedWithActiveCte` (T010c) faz `innerJoin` em `cte_batch_items`, cuja unique é
`(company_id, batch_id, nfe_document_id)` — **por lote, não global**. A mesma NF-e pode existir em
dois lotes (lote cancelado e refeito), e se os dois tiverem `cte_fiscal_documents` autorizado ao
mesmo tempo, a mesma nota sai duplicada na lista. Não corrigido de propósito: dois CT-e autorizados
simultâneos para a mesma NF-e já são anomalia fiscal, e esta lista existe justamente para
**expor** anomalia — a linha duplicada é informação, não ruído. Se a 059 consumir esta consulta
para decidir algo automaticamente, aí a deduplicação passa a ser obrigatória.

## Medições de campo

Uma coisa desta spec não se prova por teste automatizado, e fica aqui datada.

| O que                                                              | Como                              | Quando | Resultado |
| ------------------------------------------------------------------- | ---------------------------------- | ------ | --------- |
| Tela de viagem por parada, arraste, ações de estado e menu de desvio em 375px, 768px e 1280px | revisão humana (T015/T015b/T016/T017 pedem isso como aceite) | — | pendente — precisa da stack local completa (Keycloak, API, viagem semeada com paradas) para abrir a tela real; a auditoria estática de CSS (T017) e os testes de contrato não substituem olhar a tela renderizada |
