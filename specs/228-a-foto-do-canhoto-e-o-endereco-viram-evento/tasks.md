# Tasks — 228 A foto do canhoto e o endereço viram evento

Uma task por vez, na ordem. Cada uma fecha com typecheck + lint + testes da app + commit isolado e evidência
em `evidence.md`. Contrato antes da implementação, **toda asserção nova provada por mutação**. Task que toca
`test/integration/**` da API só fecha com o **segundo** comando
(`bun --env-file=../../.env.test run test:integration`).

Nenhum `[NEEDS CLARIFICATION]` aberto: a N1 foi respondida em 2026-10-02 ("Só correção humana") e virou a
D11. **Esta spec não tem migration** — se alguma task concluir que precisa de uma, pare e pergunte.

## Fase 0 — Conferência

> 🤖 Modelo: `sonnet`

- [x] **T0.1** Reler, contra o `HEAD` do dia, cada linha da tabela "O que já existe" da spec (arquivo:linha) e
      o estado das specs 195, 196 e 206. Se a 195 tiver começado a gravar correção, conferir que ela grava em
      `geocoded_address_corrections` e não numa tabela própria. Aceite: divergências listadas no
      `evidence.md`, ou "nenhuma".

## Fase 1 — Vocabulário (API e painel na mesma lista)

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Contrato: a paridade `apps/frontend-transportada/test/trip/timeline.contract.ts` com os dois
      `kind`s; prioridades da D6 sem renumerar nenhuma existente; `addressChange` aceito **só** no `kind` do
      endereço e recusado em qualquer outro; o validador **atual** descarta os `kind`s novos sem recusar a página
      (CA07).
- [x] **T1.2** Implementar `TRIP_TIMELINE_KINDS`/`TRIP_TIMELINE_KIND_PRIORITY`/`TripTimelineItem` na API e a
      cópia, ícone (`camera`, `edit`), tom neutro, títulos e locales (pt-BR e en) no painel. Aceite: typecheck,
      lint e testes **das duas** apps verdes; nenhuma fonte emite ainda.

## Fase 2 — Foto do canhoto (API)

> 🤖 Modelo: `sonnet` · T2.2 🧠 (keyset com instante calculado e lista fechada de leitores — validar com
> `architect` em `opus` antes)

- [x] **T2.1** Contratos (antes): unitário do mapeamento (D2: `captured_at` ou `created_at`; posição; estado);
      estático do SQL (`company_id` em todas as tabelas, `'photo'` literal, `trip_document_id = documentId` sem ramo `is null` + `documentStopScope`, mesma expressão `coalesce` no filtro/ordem/chave, colunas proibidas ausentes); leitores
      (`event-location-readers.contract.ts` reprova sem a entrada); rota (sem `trip.event-location` →
      `location = null`); corpo sem `receiverName`/`receivedBy`/URL (CA06); integração Postgres: CA01, CA02,
      cursor em páginas de 1 com foto e entrega com `created_at` forçado igual e `captured_at` nulo, e instantes que diferem só no µs (RF4), empresa/viagem estranha → nada. A foto tem prioridade **3** (D6).
- [x] **T2.2** 🧠 `trip-timeline-proof.query.ts` + `Promise.all` + entrada em `EVENT_LOCATION_READERS`.
      Aceite: os **dois** comandos da API verdes; `EXPLAIN` (com `SET LOCAL enable_seqscan = off` em transação) registrado no `evidence.md`. Erro de fonte propaga (sem catch).

## Fase 3 — Endereço corrigido (API)

> 🤖 Modelo: `sonnet` · T3.2 🧠 (`distinct on` + keyset — validar com `architect` em `opus`)

- [x] **T3.1** Contratos (antes): unitário de `addressChange` (origem, deslocamento, `null` sem ponto
      anterior e no refino); estático (empresa nas duas trilhas e na parada, `created_at >= parada`, só
      `refined`, `distinct on` em subselect, nenhum `geocodedAddresses`, nenhum `reason`/`requestedBy`, `documentStopScope`); refino com `location = null`; empate forçado com `document.occurrence`; integração: CA03, CA04 (duas paradas, mesma chave, páginas de 1), CA05, filtro por nota (só a
      parada da nota; nota sem parada → nenhum evento de endereço).
- [x] **T3.2** 🧠 `trip-timeline-address.query.ts` + `Promise.all`. Aceite: os **dois** comandos da API
      verdes; `EXPLAIN` registrado.

## Fase 4 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Contrato + implementação: _Eventos desta entrega_ e a linha do tempo da viagem mostram "Foto do
      canhoto" e "Endereço da parada corrigido", com origem e deslocamento; "Ver no mapa" só com
      `location`. Aceite: suíte do painel verde pelo script `test` (nunca `bun test` cru).
- [ ] **T4.2** Prints (CA08) em 1280 e 375, dark e light, sem transbordo, comparados com a prancha do canvas
      da 227. **Exige o ok explícito do usuário** (web.md §15).

## Fase 5 — Documentação, portões e revisão

> 🤖 Modelo: `sonnet` · T5.3 `code-reviewer` em `opus`

- [ ] **T5.1** Documentação viva: `docs/ai-context/api-transportada.md` (as duas fontes novas, D1/D4) e
      `frontend-transportada.md`; marcar na 227 que a Fase 5 dela recebeu os eventos, e levar à T6.1 da 227 a ressalva da
      D12 (foto derivada, sem tabela) para o usuário confirmar junto dos prints.
- [ ] **T5.2** Portão completo na raiz, um comando por vez em primeiro plano (`make check`; `format:check` é
      gate só da raiz e cobre `specs/`).
- [ ] **T5.3** Revisão por `code-reviewer` em `opus`: tenant nas fontes novas, recorte de posição, PII no
      corpo e no log, keyset.

## O que não se decide sozinho

Pare e pergunte antes de: empurrar para staging, deploy, **qualquer migration** (esta spec não prevê
nenhuma), migration destrutiva, qualquer `[NEEDS CLARIFICATION]`, e na **T4.2** (ok do usuário sobre os
prints).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/228-a-foto-do-canhoto-e-o-endereco-viram-evento/ (leia
spec.md, plan.md e tasks.md antes de tocar em código). Uma task por vez, na ordem do tasks.md, começando
pela Fase 0.
Modelos: Fase 0 → executor model=sonnet · Fase 1 → executor model=sonnet · Fase 2 → executor model=sonnet,
com T2.2 🧠 validada por architect model=opus antes · Fase 3 → executor model=sonnet, com T3.2 🧠 validada por
architect model=opus antes · Fase 4 → executor model=sonnet · Fase 5 → executor model=sonnet, revisão T5.3 →
code-reviewer model=opus.
Cada task fecha com typecheck + lint + testes da app (script `test`, nunca `bun test` cru) + commit isolado,
evidência em evidence.md. Task que toca test/integration/** da API só fecha com
`bun --env-file=../../.env.test run test:integration`. Contrato antes da implementação, e toda asserção nova
provada por mutação. Prettier nos .md (format:check da raiz cobre specs/).
PARE E PERGUNTE antes de: deploy, empurrar para staging, qualquer migration (esta spec não prevê nenhuma),
migration destrutiva, qualquer [NEEDS CLARIFICATION] (nenhum aberto), e na T4.2 — os prints exigem o ok
explícito do usuário (web.md §15).
```
