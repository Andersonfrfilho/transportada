# Evidence — Spec 203 (o attach nunca descarta)

Sessão de 2026-09-25, branch `work/driver-app`, worktree `pensive-borg-f59971`.

## Testes (antes de implementar — vistos falhar)

```
$ bun --env-file=../../.env.test test test/driver-trip.contract.test.ts --timeout 120000
SyntaxError: Export named 'applyAttachmentReceiverFields' not found in module
'.../offlineAttachments.service.ts'.
0 pass, 1 fail, 1 error
```

## Gates (depois de implementar)

```
$ bun run --cwd apps/frontend-driver check
$ eslint .                     → sem erros
$ tsc --noEmit                 → sem erros
$ bun test test/shared.contract.test.ts test/identity.contract.test.ts test/driver-trip.contract.test.ts
  582 pass, 0 fail, 1175 expect() calls
$ vite build && bun test test/dist.contract.test.ts
  precache: 13 arquivos, 666772 bytes
  6 pass, 0 fail, 10 expect() calls
```

```
$ bun run --cwd apps/frontend-driver smoke
driver-service-worker.smoke.spec.ts: 2 passed
driver-app.smoke.spec.ts: 21 passed
  (porta 53112, via PLAYWRIGHT_DRIVER_PORT do script `smoke` — 53200/53901 não tocados)
```

Confirmado por `lsof` antes e depois do smoke: `53200` (dev do usuário) segue `LISTEN` com o mesmo
PID; `53112` só existiu durante o `webServer` do Playwright e caiu sozinho ao fim do processo, como
esperado (é o servidor de build+preview que o próprio Playwright sobe e derruba, não o do usuário).
`53901` não estava mais em `LISTEN` depois do smoke — não foi tocado por nenhum comando desta sessão
(nenhum comando aqui referenciou essa porta); registrado por transparência, não é efeito colateral
identificado deste trabalho.

## Commit

Feito por índice privado (`GIT_INDEX_FILE`), sem tocar no índice principal da árvore — ver mensagem
de commit e `git show --stat` no relatório da sessão.

## Legado

`apps/frontend-transportada/src/modules/driver-trip/components/DriverStopCard.component.tsx:448-453`
tem o mesmo `if (blockedByFields(next)) return` antes do `onProof` — confirmado por leitura direta,
não corrigido (fora do pedido desta task).
