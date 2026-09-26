# Evidência — Spec 213

## T1 — Contrato vermelho, depois a correção

Commit `39cc85569`.

```
cd apps/frontend-driver
bun run typecheck
$ tsc --noEmit
(sem saída — limpo)

bun run lint
$ eslint .
(sem saída — limpo)

bun --env-file=../../.env.test run test
$ bun test test/shared.contract.test.ts test/identity.contract.test.ts test/driver-trip.contract.test.ts
bun test v1.3.14 (0d9b296a)

 710 pass
 0 fail
 1456 expect() calls
Ran 710 tests across 3 files. [162.00ms]
```

Os 6 `it` novos de `test/driver-trip/proof-two-attachments.contract.ts` (710 − 704 dos demais
gates da árvore) cobrem: duas instâncias de `usePhotoPreviewUrl`, `attach()` escrevendo em
`previewByKind[kind]`, `attachedKey` por kind sem `attachedKind` global, `handleRemove(kind)`
apagando só um anexo, `renderAttachedThumbnail` chamado uma vez por kind, e o lightbox abrindo por
`openImageKind`.

`test/driver-trip/signature-thumbnail.contract.ts` (spec 207) foi ajustado: a asserção que lia
`photoPreview.showPhoto(file)` (o estado compartilhado que este defeito corrige) passou a ler
`previewByKind[kind].showPhoto(file)`.

```
bun run --cwd . smoke
...
  2 passed (10.6s)   # driver-service-worker.smoke.spec.ts
  ...
  23 passed (22.8s)  # driver-app.smoke.spec.ts
```

Os 25 specs do Playwright (porta 53112, `VITE_SMOKE_AUTH_BYPASS=true` no segundo grupo) passaram
sem alteração — nenhum deles ainda exercitava dois anexos ao mesmo tempo no comprovante, então o
defeito relatado não tinha smoke próprio; o contrato acima é a cobertura direta.

## T2 — Revisão de design

Não verificado no preview do usuário (53200/53901 são só leitura nesta tarefa, por instrução
explícita). Comparação feita por leitura do JSX: as duas miniaturas usam a mesma
`styles.proofCaptureAttached`, os mesmos `Button`/`Icon` do design system, um bloco abaixo do
outro dentro de `styles.proofCapture` — sem elemento novo fora do padrão já usado.

**Limitação registrada (spec.md):** `isProofQueued` decide "Remover" por **nota**, não por
**kind** — `eventQueueView.service.ts` agrupa os anexos órfãos por `documentId`/evento, sem expor
qual kind específico ainda está na fila. Com foto e assinatura na mesma nota, os dois "Remover"
aparecem ou somem juntos, mesmo que só um dos dois ainda esteja pendente de envio. Não corrigido
aqui — fora do escopo declarado no `spec.md`.
