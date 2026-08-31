# Evidência

## Fase A — A NFS-e para de perguntar o peso

Concluída em 2026-08-31.

### O caso que originou a feature

NF-e **883663/2** da Comercial Zaragoza, autorizada em 28/08/2026, recusada na seleção de **NFS-e**
com `CTE_BATCH_DOCUMENT_MISSING_WEIGHT`. O XML do emitente:

```xml
<vol><qVol>20</qVol><pesoL>0.000</pesoL><pesoB>0.000</pesoB></vol>
```

A nota **883658** da mesma carga (mesmo lacre 1022495, mesmo `NroCarga` 64175, mesma placa) veio com
`qVol` 11 e `pesoB` 108.670 — o emitente omite peso por nota, não sistematicamente.

### T001 — Contrato antes da implementação

`test/nfse-domain/eligibility-without-weight.contract.ts`, com a 883663/2 como fixture. Vermelho
pelo motivo certo antes de qualquer mudança de produção:

```
- []
+ [{ "documentId": "document-883663", "reason": "CTE_BATCH_DOCUMENT_MISSING_WEIGHT", ... }]
(fail) a nota com peso zerado pelo emitente é elegível para NFS-e
48 pass, 1 fail
```

### T002–T004 — Implementação

- `checkSharedEligibility` extraída (autorizada, completa, valor, participantes, municípios), com
  `SharedEligibilityDocument` e `SharedEligibilityBlockReason`. `checkDocumentEligibility` passou a
  ser `compartilhado + peso`, e o peso ficou só no CT-e.
- `nfse-selection.policy.ts` chama o gate compartilhado; `NfseSelectionBlockReason` deixou de
  admitir o motivo de peso, por tipo.
- `nfse-invoice-selection.query.ts` parou de consultar `nfe_volumes` — uma consulta a menos por
  página, de um dado que o RPS nunca declarou.

O typecheck apontou sozinho os dois únicos lugares que ainda declaravam peso na fixture de NFS-e,
que é a prova de que nada mais no domínio dependia dele.

### T005 — Rótulo

`CTE_BATCH_DOCUMENT_MISSING_WEIGHT` removido de `nfseInvoice.locale.json` e `.en.` (rótulo morto:
a NFS-e não emite mais esse motivo) e **mantido** em `nfeWorkspace.locale.json`, onde ainda descreve
o bloqueio de CT-e.

### T006 — Gate

```
make check exit=0
api-transportada    3794 pass, 0 fail
worker-transportada  777 pass, 0 fail
frontend-transportada 2203 pass, 0 fail
```

### Contratos que travam a regressão

- `test/nfse-domain/eligibility-without-weight.contract.ts` — a nota sem peso é elegível para NFS-e,
  **e** segue inelegível para CT-e. Os dois no mesmo arquivo de propósito: se caírem juntos, alguém
  tirou o gate dos dois de uma vez.
- `test/nfse-schema/invoice-selection-query-tenant-safety.contract.ts` — a seleção de NFS-e não
  menciona `nfeVolumes`. Se a tabela reaparecer ali, o gate voltou junto.

## Fase B — Peso padrão

Não iniciada.
