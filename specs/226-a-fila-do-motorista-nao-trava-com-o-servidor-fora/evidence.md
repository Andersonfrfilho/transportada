# Evidence — spec 226

Base: `origin/staging` em `a6234923d`. Branch `work/driver-queue-resilience`.

## Vermelho antes (T1.1, T2.1)

- `retryable-status.contract.ts` (app novo) antes da implementação: **12 falhas** — exatamente os
  casos de indisponibilidade (408/429/502/503/504 com JSON e com HTML, a drenagem com `503` e o PUT
  ao storage). Os casos de recusa, o `500` e o `200` ilegível já passavam: são as guardas.
- Contratos de roteamento atualizados para a fila: 3 falhas antes do código.
- Legado: o módulo nem carregava (`toOutcome` não era exportado).

## Prova por mutação (T3.1)

Cada mutação aplicada, a suíte `driver-trip.contract.test.ts` rodada, o arquivo restaurado.

| #   | Mutação                                                         | Resultado |
| --- | --------------------------------------------------------------- | --------- |
| 1   | app novo: `toAttachmentSendOutcome` ignora o status transitório | 12 falhas |
| 2   | app novo: `500` entra no conjunto transitório                   | 2 falhas  |
| 3   | app novo: o `RESPONSE_INVALID` do HTML perde o `status`         | 6 falhas  |
| 4   | app novo: nota sem foto deixa de ir com `photo: null`           | 1 falha   |
| 5   | legado: `toOutcome` ignora o status transitório                 | 10 falhas |
| 6   | legado: o `RESPONSE_INVALID` do HTML perde o `status`           | 5 falhas  |

Restaurado: 892 pass / 0 fail (app novo, contrato do driver-trip) e 284 / 0 (legado).

## Gates (T3.2)

- `bun run typecheck` e `bun run lint`: exit 0 nas duas apps.
- `bun run --cwd apps/frontend-driver test`: 1002 pass / 0 fail.
- `bun run --cwd apps/frontend-transportada test`: 6264 pass / 0 fail e `test:hooks` 248 / 0.
- `prettier --check` nos arquivos tocados: limpo.
- `grep registerDocumentOccurrence apps/frontend-driver/src`: vazio.

## Revisão de design (T3.3)

- Keycloak local subido com `make up SERVICES=keycloak`; prints gerados com
  `test/spec-226-prints.smoke.spec.ts` (login real, API de smoke), 375 px, claro e escuro, em
  `prints/nota-sem-foto-{na-fila,enviada}-375-{light,dark}.png`.
- Achado: o selo dizia "Ocorrência **com foto** na fila" para a ocorrência sem foto. Corrigido (D7).
- Smoke de ocorrência/fila depois da troca de cópia: 8 passed.
- No print "enviada" aparecem "Entreguei"/"Não entreguei" porque o dublê da API do smoke marca
  qualquer `POST` de parada/nota como chegada — artefato do mock, não do produto.
- Segundo achado do preview (D8): a linha de sincronização com 2 eventos parados. Corrigida;
  `resolveSyncPhase` coberto em `sync-status.contract.ts`, print refeito
  (`prints/fila-de-pendencias-375-{light,dark}.png`).
