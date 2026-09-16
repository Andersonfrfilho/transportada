# Tasks — 153

Cada task: contrato vermelho → implementação → typecheck + lint + testes da app (API com
`--env-file=../../.env.test`) → evidência em `evidence.md` → commit isolado.

## Fase 0 — Spike

> 🤖 Modelo: `sonnet`

- [x] T001 Confirmar que o OSRM (profile `car.lua` padrão, MLD, v6.0.0) aceita `exclude=toll`:
      chamada real contra o OSRM de staging ou a fixture `deploy/osrm/fixtures` — resultado em
      `evidence.md`. Se não aceitar, parar e reportar (D1 depende disso).

## Fase 1 — Dados e seams da API

> 🤖 Modelo: `sonnet` (T102 é 🧠 — `opus`)

- [ ] T101 Migration aditiva do RF1 + schema Drizzle + rollback — `make migration-test`.
- [ ] T102 🧠 Assinatura de rota, `selectRouteOption` e `summarizeRoadDistance` (domínio puro) —
      contratos de domínio (assinatura estável, critérios, não reproduzida, volta `0` em
      `last_stop`).
- [ ] T103 Gateway com `exclude=toll` em paralelo, dedupe por assinatura, `isNoToll`, falha isolada —
      contrato com gateway falso.
- [ ] T104 `read-route-geometry`: `signature`, `isNoToll`, `selectedIndex` na mais barata, topo = a
      selecionada — contratos de route-geometry atualizados.

## Fase 2 — A viagem grava a rota

> 🤖 Modelo: `sonnet`

- [ ] T201 Congelamento da rota inteira (`freeze-trip-planned-route`), `plan-route` com
      `routeChoice`, D3 e D5 — contratos + integração.
- [ ] T202 Valuation da viagem lê distância e pedágio gravados; prévia aceita `routeChoice`;
      paridade prévia × viagem (aceite 2).
- [ ] T203 `GET /trips/:id/route-geometry` devolve a gravada (`frozen`) — contrato HTTP.
- [ ] T204 Aceite multi-veículo com `routeChoice` por veículo; aceite por viagem grava rota.
- [ ] T205 Reorder, link (unitário e lote) e release recalculam com `cheapest` antes do despacho —
      contratos nos caminhos, OSRM falhando sem derrubar.

## Fase 3 — Dinheiro só para o financeiro (API)

> 🤖 Modelo: `sonnet`

- [ ] T301 Serviço de redação monetária + aplicação em route-geometry ×2, detalhe da viagem e NF-e
      (listagem e leitura) — contrato HTTP sem `trip.financials` (aceite 3).

## Fase 4 — Frontend da rota e dos valores

> 🤖 Modelo: `sonnet`

- [ ] T401 Validação de respostas com campos novos e monetários opcionais.
- [ ] T402 `TripAssemblyMap`: seletor com "Sem pedágio", abre na mais barata, `onRouteChoiceChange`,
      `canReadFinancials` no mapa e no `RouteTollSummary`.
- [ ] T403 Criação manual envia a escolha; ordem reorder → plan corrigida.
- [ ] T404 Proposta: escolha por veículo no aceite e na prévia da conta.
- [ ] T405 Detalhe: rota gravada, km/volta/tempo, critério, avisos, custos e valor da NF só com
      permissão.

## Fase 5 — Um mapa só

> 🤖 Modelo: `sonnet`

- [ ] T501 Aba Regiões em MapLibre (polígonos por zona, clique, legenda, cidades fora da malha).
- [ ] T502 Remoção de `VectorMap` e do resto do mapa antigo (RF11) + contrato de fonte (aceite 4).

## Fase 6 — Documentação e revisão

> 🤖 Modelo: `haiku` (docs) · `opus` (revisão)

- [ ] T601 `apps/api-transportada/CLAUDE.md`, `apps/frontend-transportada/CLAUDE.md` e
      `docs/ai-context/*`: rota gravada, redação monetária, mapa único.
- [ ] T602 Revisão final com `code-reviewer` `model=opus`; `make check`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/153-rota-escolhida-e-mapa-unico/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0–5 → executor model=sonnet · T102 🧠 → opus · Fase 6 docs → writer model=haiku ·
revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + lint + testes da app (API com --env-file=../../.env.test) + commit
isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy em produção, migration destrutiva, T001 negativo (OSRM sem
exclude=toll), qualquer [NEEDS CLARIFICATION].
```
