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

Concluída em 2026-08-31.

### O contraponto que definiu o desenho

A NF-e **883658** da mesma carga da 883663 (mesmo lacre 1022495, mesmo `NroCarga` 64175, mesma
placa, mesmo minuto) veio com `qVol` 11 e `pesoB` **108.670**. O emitente omite peso **por nota**,
não por política — é isso que descarta "emitente que não preenche" como hipótese e justifica uma
estimativa em vez de um conserto na origem.

### T101/T103 — Contrato antes da implementação

`test/cte-batch-domain/weight-gate.contract.ts`, com as duas notas reais como fixture. Vermelho por
módulo inexistente antes de `cargo-weight.policy.ts` existir; verde depois, cobrindo: XML vence
padrão, estimativa por volume, sem padrão não estima, `qVol` zero não estima, nota sem volume não
estima, o gate bloqueia sem peso e passa com estimativa.

### T102 — Migration

`drizzle/20260831213731_company_cargo_settings/` — tabela nova, `rollback.sql` ao lado, `db:check`
limpo, e a migration registrada em `test/database-migration/static-migration.contract.ts` (a lista
é explícita; sem isso o contrato reprova).

⚠️ **`make migration-test` não rodou**: o Docker não estava de pé nesta máquina. É a única evidência
desta fase que ficou pendente, e ela precisa rodar antes do merge.

⚠️ **Deriva encontrada, não causada por esta spec:** as migrations `20260831180000` e
`20260831190000` foram escritas à mão e os `snapshot.json` delas nunca foram atualizados — não
contêm as colunas que elas mesmas criam. Por isso `db:generate` tentou recriar `login_identifiers.
source`, `is_whatsapp` e `identity_user_pictures.public_token` junto com a tabela nova. A
`migration.sql` foi podada para conter só o que é desta spec; o `snapshot.json` gerado reflete o
schema real e **conserta a deriva** para o próximo `db:generate`.

### T104 — Os três consumidores

Listagem de notas, seleção de lote e payload de CT-e passaram a ler o peso efetivo. O padrão da
empresa é resolvido **uma vez por página/lote**, no mesmo `Promise.all` que já buscava os pesos —
nunca por linha. No payload a estimativa entra **por volume** (`applyEstimatedWeight`), para a soma
de `composeCargoQuantities` seguir coerente com o `qVol`; volume já pesado nunca é tocado.

### T105 — Configuração

`GET`/`PUT`/`DELETE /company-settings/cargo` sob `settings.manage`, escopo `company`. No frontend o
painel mora na aba de importações de Notas — onde a linha bloqueada aparece —, registrado em
`SETTINGS_PANEL_PLACEMENT.cargoWeight` e coberto por
`test/nfe-workspace/distribution-settings.contract.ts`.

⚠️ **A marca de "peso estimado" por nota não foi entregue, e o motivo é que não há onde pô-la:** a
prévia do lote não serializa peso e a tabela de Notas não tem coluna de peso. O campo
`cargoWeightSource` chegou a ser adicionado ao port da prévia e foi **removido** para não ficar sem
consumidor. A divulgação hoje existe só no painel de configuração, que diz quanto está sendo
estimado por volume. Registrado como consequência na ADR-0052.

### T106/T107 — Gate

```
make check exit=0
api-transportada     3801 pass, 23 skip, 0 fail
worker-transportada   777 pass, 0 fail
frontend-transportada 2203 pass, 0 fail
```

ADR-0052 escrita, `CLAUDE.md` atualizado com as duas metades da regra.

## Pendências

- `make migration-test` com Docker de pé (T102).
- Marca de peso estimado por nota, quando alguma tela passar a mostrar peso.
