# Evidência — 212 A foto do canhoto cabe no teto

## T001 — os contratos falham antes do código

**API** (`bun --env-file=../../.env.test test --timeout 120000
./test/trip-delivery-proof/proof-body-limit.contract.ts`, com `DELIVERY_PROOF_MAX_BYTES =
2_000_000`):

```
Expected: 983040
Received: 2000000
(fail) ... o teto do arquivo do motorista é o do escritório (960 KiB), abaixo do corpo de 1 MiB
Expected: 422
Received: 201
(fail) ... o arquivo entre 960 KiB e o corpo de 1 MiB volta 422 TRIP_DELIVERY_PROOF_TOO_LARGE
 2 pass
 2 fail
```

O 413 de 1,1 MB e o 201 de 950 KiB já passavam: o defeito era o 422 inalcançável.

**App do motorista.** Primeiro o módulo ausente (`Cannot find module
'@/modules/driver-trip/shared/proofPhotoRecovery.service'`). Depois, com o código pronto, cada trava
foi revertida numa cópia (scratchpad → reverter → rodar → `cp` de volta):

- sem o pulo de `pendingReduction` na drenagem:
  `(fail) a drenagem espera a redução (spec 212) > o item marcado não sobe — nem na drenagem geral,
nem no "Enviar agora"`;
- sem o critério de tamanho na recuperação:
  `(fail) a foto presa volta a subir sozinha (spec 212) > causa 413 e arquivo grande: reduz, limpa a
causa e a drenagem automática leva` — 13 pass / 1 fail.

**Painel `/minha-viagem`.** Módulo ausente, e depois, sem o pulo na drenagem:
`(fail) /minha-viagem: a drenagem espera a redução (spec 212) > o item marcado não sobe — nem na
drenagem geral, nem no "Enviar"` — 10 pass / 1 fail.

## T006 — gates, depois do código (2026-09-26)

| Gate                                                       | Resultado                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| `bun run --cwd apps/frontend-driver check`                 | exit 0 — lint, `tsc`, 704 pass / 0 fail, build, dist 6 pass |
| `bun run --cwd apps/frontend-driver smoke` (53112)         | exit 0 — 2 passed + 23 passed                               |
| API `bun --env-file=../../.env.test test --timeout 120000` | 7509 pass / 23 skip / 0 fail (184 arquivos)                 |
| API `bun --env-file=../../.env.test run test:integration`  | 642 pass / 7 skip / 0 fail (117 arquivos)                   |
| painel `bunx tsc --noEmit`                                 | exit 0                                                      |
| painel `bun run lint`                                      | exit 0                                                      |
| painel `bun run test`                                      | 5372 pass / 0 fail, e `test:hooks` 54 pass / 0 fail         |

A primeira rodada da integração deu 641 pass / 1 fail: `trip-status-write-guard.integration.ts`
("markCancelled perde a corrida…") estourou os 5 s sob a carga da suíte inteira. Sozinho, o arquivo
passou duas vezes (4/4), e a segunda rodada da suíte inteira passou limpa (acima). Nada ali toca o
comprovante.

Os gates rodaram na árvore compartilhada, com o trabalho em curso de outra sessão (tela do
comprovante) junto. Os commits desta spec levam só os trechos dela.
