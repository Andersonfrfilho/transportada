# Evidência — Feature 182

## T1.1 — Quem depende da unicidade `(company, stop_event, kind)`

Mapeado em 2026-09-24 com `grep -rn "insert(tripDeliveryProofs)"` em `apps/api-transportada/src`.
Duas escritas, e as duas são `onConflictDoUpdate` com esse alvo exato:

| Arquivo | Linha | Caminho |
|---|---|---|
| `trips/infrastructure/drizzle-delivery-proof.repository.ts` | 331 | anexo do motorista pela rota própria |
| `trips/infrastructure/drizzle-driver-field-report.repository.ts` | 634 | `saveDeliveryProofWithinTransaction` — motorista **e** escritório (`office-delivery-proof.service.ts:146`) |

**Consequência para a T1.3:** trocar a constraint por índice único parcial sem tocar nesses dois
faz o Postgres recusar o `ON CONFLICT` ("there is no unique or exclusion constraint matching the ON
CONFLICT specification") — a baixa quebraria, a do motorista inclusive.

**Decisão:** os dois ganham `targetWhere: kind <> 'cargo'`, repetindo o predicado do índice. O
Postgres infere o índice parcial como árbitro; a linha `cargo` nunca satisfaz o predicado, então
nunca conflita e entra como inserção simples — pela **mesma** função, sem ramo de persistência novo.

## T1.2–T1.4 — Banco (2026-09-24)

**Mudança.** `TRIP_DELIVERY_PROOF_KINDS` ganha `cargo`; a constraint
`trip_delivery_proofs_company_event_kind_unique` vira índice único parcial `where kind <> 'cargo'`;
os dois `onConflictDoUpdate` repetem o predicado em `targetWhere` — **como literal**: com `$1` a
inferência do índice parcial falha do mesmo jeito. Migration `20260924142302_delivery_proof_cargo_kind`
com `rollback.sql` que recusa enquanto houver linha `cargo` e apaga a própria linha do journal
conferindo `ROW_COUNT`.

**Gates.**

| Comando | Resultado |
|---|---|
| `make migration-test` | 110 pass, 0 fail, 0 skip — sobe, desce, sobe, desce |
| contrato da API (`bun --env-file=../../.env.test test`) | 7220 pass, 0 fail (23 skip pré-existentes, `testWithPostgres` sem banco) |
| integração da API (`bun --env-file=../../.env.test run test:integration`) | 571 pass, 0 fail, 7 skip pré-existentes — 106 arquivos, 502 s |
| `bun run typecheck` | limpo |

**Mutações — o teste falha sem a correção:**

| Mutação | Resultado |
|---|---|
| mensagem do `RAISE` do rollback trocada | `migration-test` 109/1: a sonda do CA08 roda de verdade |
| `targetWhere` removido do repositório compartilhado (escritório) | 3 falhas com `there is no unique or exclusion constraint matching the ON CONFLICT specification` |
| `targetWhere` removido do repositório do motorista | 4 falhas no app do motorista |

Sem o `targetWhere`, **toda baixa com foto quebraria em produção** — do escritório e do motorista.
O risco que o plano apontou era real, e agora tem teste.

**CA01, CA02, CA08:** `delivery-proof-cargo.assertion.ts` grava duas fotos `cargo` no mesmo evento,
recusa o segundo canhoto pelo índice parcial e prova que o rollback recusa sem apagar. O teste novo
em `trip-field-office.integration.ts` força o `DO UPDATE` pela rota real: o segundo canhoto do
escritório substitui o primeiro.
