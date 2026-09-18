# Spec 157 — Evidência

## T1 — ADR-0068

Arquivo `docs/adr/0068-a-foto-obrigatoria-do-motorista-pesa-na-nota.md` já existia no worktree antes
desta sessão (aceita, cita ADR-0057 e ADR-0067 §5 emenda 2). Marcada como concluída junto do commit
da T2.

## T2 — `classifyProofPunctuality`

Arquivos:

- `apps/api-transportada/src/trips/domain/delivery-proof-punctuality.policy.ts` (novo)
- `apps/api-transportada/test/trip-delivery-proof/punctuality.contract.ts` (novo, 13 casos)
- `apps/api-transportada/test/trip-delivery-proof.contract.test.ts` (import adicionado)

Assinaturas exportadas: `PROOF_PUNCTUALITY` (const object), `ProofPunctuality`, `ProofPosition`,
`ClassifyProofPunctualityParams`, `classifyProofPunctuality(params): ProofPunctuality`.

Comandos e resultado:

```
$ bun run typecheck                                            # raiz, todas as apps — 0 erros
$ bun run lint                                                  # raiz, todas as apps — 0 erros
$ bun test ./test/trip-delivery-proof.contract.test.ts
 57 pass / 0 fail / 80 expect() calls
```

Casos cobertos: aceite 3 (100 m/10 min → on_time), aceite 4 (2h → late; 2 km → away; sem posição →
away), combinação `late_and_away`, `capturedAt` no futuro e antes da entrega (ambos limitados pela
folga de 2 min de `field-delivery-timing.policy.ts`), parada sem coordenada usa o evento, sem
referência nenhuma de local a distância não julga, precisão soma ao raio, `not_required` para
`optional`/`off`.
