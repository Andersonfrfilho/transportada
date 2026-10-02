# Tasks — 228 A foto do canhoto e o endereço viram evento

Uma task por vez, na ordem. Cada uma fecha com typecheck + lint + testes da app + commit isolado e evidência
em `evidence.md`. Contrato antes da implementação, **toda asserção nova provada por mutação**. Task que toca
`test/integration/**` da API só fecha com o **segundo** comando
(`bun --env-file=../../.env.test run test:integration`).

⚠️ **Uma `[NEEDS CLARIFICATION]` aberta (N1, `spec.md` § Perguntas abertas).** A F2 não depende dela; a F1
(nome do `kind`), a F3 (rótulo) e a F4 (existência) dependem.

## Fase 0 — Conferência

> 🤖 Modelo: `sonnet`

- [ ] **T0.1** Reler, contra o `HEAD` do dia, cada linha da tabela "O que já existe" da spec (arquivo:linha) e
      o estado das specs 195, 196 e 206. Se a 195 tiver começado a gravar correção, conferir que ela grava em
      `geocoded_address_corrections` e não numa tabela própria. Aceite: divergências listadas no
      `evidence.md`, ou "nenhuma".

## Fase 1 — Vocabulário (API e painel na mesma lista)

> 🤖 Modelo: `sonnet` · espera N1 (nome do `kind` do endereço)

- [ ] **T1.1** Contrato: a paridade `apps/frontend-transportada/test/trip/timeline.contract.ts` com os dois
      `kind`s; prioridades da D6 sem renumerar nenhuma existente; `addressChange` aceito **só** no `kind` do
      endereço e recusado em qualquer outro; o validador **atual** descarta os `kind`s novos sem recusar a página
      (CA07).
- [ ] **T1.2** Implementar `TRIP_TIMELINE_KINDS`/`TRIP_TIMELINE_KIND_PRIORITY`/`TripTimelineItem` na API e a
      cópia, ícone (`camera`, `edit`), tom neutro, títulos e locales (pt-BR e en) no painel. Aceite: typecheck,
      lint e testes **das duas** apps verdes; nenhuma fonte emite ainda.

## Fase 2 — Foto do canhoto (API)

> 🤖 Modelo: `sonnet` · T2.2 🧠 (keyset com instante calculado e lista fechada de leitores — validar com
> `architect` em `opus` antes)

- [ ] **T2.1** Contratos (antes): unitário do mapeamento (D2: `captured_at` ou `created_at`; posição; estado);
      estático do SQL (`company_id` nas quatro tabelas, `kind = 'photo'`, filtro de nota estrito); leitores
      (`event-location-readers.contract.ts` reprova sem a entrada); rota (sem `trip.event-location` →
      `location = null`); corpo sem `receiverName`/`receivedBy`/URL (CA06); integração Postgres: CA01, CA02,
      cursor em páginas de 1 com foto e entrega no mesmo instante (RF4), empresa estranha → nada.
- [ ] **T2.2** 🧠 `trip-timeline-proof.query.ts` + `Promise.all` + entrada em `EVENT_LOCATION_READERS`.
      Aceite: os **dois** comandos da API verdes; `EXPLAIN` da consulta registrado no `evidence.md`.

## Fase 3 — Endereço corrigido (API)

> 🤖 Modelo: `sonnet` · espera N1 · T3.2 🧠 (`distinct on` + keyset — validar com `architect` em `opus`)

- [ ] **T3.1** Contratos (antes): unitário de `addressChange` (origem, deslocamento, `null` sem ponto
      anterior e no refino); estático (empresa nas duas trilhas e na parada, `created_at >= parada`, só
      `refined`); integração: CA03, CA04 (duas paradas, mesma chave, páginas de 1), CA05, filtro por nota (só a
      parada da nota; nota sem parada → nenhum evento de endereço).
- [ ] **T3.2** 🧠 `trip-timeline-address.query.ts` + `Promise.all`. Aceite: os **dois** comandos da API
      verdes; `EXPLAIN` registrado.

## Fase 4 — Geocodificação automática como evento (só se N1 = sim)

> 🤖 Modelo: `opus` 🧠 · **PARAR E PERGUNTAR ao usuário antes de escrever a migration**

- [ ] **T4.1** 🧠 Desenho com `architect` em `opus` (esboço no `plan.md` § F4): tabela, fan-out por empresa,
      o que gravar quando o endereço já tinha coordenada, expurgo ou exclusão do 196 D8. **Parar e mostrar ao
      usuário** antes da T4.2.
- [ ] **T4.2** 🧠 Migration aditiva com `rollback.sql`, `db:generate` = `no_changes` depois,
      `make migration-test` verde. **Só com o ok explícito do usuário.**
- [ ] **T4.3** Escritas no worker e na API, contrato de paridade do expurgo (`stamped-tables.contract.ts`),
      fonte nova na linha do tempo. Aceite: testes do worker (`make worker-integration`) e os dois da API.

## Fase 5 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Contrato + implementação: _Eventos desta entrega_ e a linha do tempo da viagem mostram "Foto do
      canhoto" e o evento do endereço (rótulo da N1), com origem e deslocamento; "Ver no mapa" só com
      `location`. Aceite: suíte do painel verde pelo script `test` (nunca `bun test` cru).
- [ ] **T5.2** Prints (CA08) em 1280 e 375, dark e light, sem transbordo, comparados com a prancha do canvas
      da 227. **Exige o ok explícito do usuário** (web.md §15).

## Fase 6 — Documentação, portões e revisão

> 🤖 Modelo: `sonnet` · T6.3 `code-reviewer` em `opus`

- [ ] **T6.1** Documentação viva: `docs/ai-context/api-transportada.md` (as duas fontes novas, D1/D4) e
      `frontend-transportada.md`; marcar na 227 que a Fase 5 recebeu os eventos.
- [ ] **T6.2** Portão completo na raiz, um comando por vez em primeiro plano (`make check`; `format:check` é
      gate só da raiz e cobre `specs/`).
- [ ] **T6.3** Revisão por `code-reviewer` em `opus`: tenant nas fontes novas, recorte de posição, PII no
      corpo e no log, keyset.

## O que não se decide sozinho

Pare e pergunte antes de: empurrar para staging, deploy, **qualquer migration** (F4), qualquer `[NEEDS
CLARIFICATION]`, e na **T5.2** (ok do usuário sobre os prints).

## Perguntas pendentes (no lugar do prompt de execução)

Esta spec **não** tem prompt de autopilot enquanto houver `[NEEDS CLARIFICATION]` aberto.

1. **N1** — A linha do tempo deve mostrar também quando **o sistema** geocodificou o endereço sozinho
   (primeira geocodificação, refino automático, rotina de população)? **Recomendação: não** — o evento vira
   "Endereço da parada corrigido" (correção humana e refino pedido no painel, derivados sem migration) e a
   Fase 4 sai. **Sim** liga a Fase 4 (migration 🧠, worker e API) e o rótulo "Endereço da parada
   geocodificado".

Respondida a N1, este bloco é trocado pela seção `## Prompt de execução`.
