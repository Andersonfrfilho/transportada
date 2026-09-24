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
