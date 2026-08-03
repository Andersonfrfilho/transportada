# Evidence

Feature 021 — Range de data nos filtros.

Nenhum dado real de tenant, CNPJ, IE, chave de acesso ou XML fiscal aparece aqui. As datas do log de
navegador são as que eu cliquei no calendário, não dados de nota.

## T001 — contrato do primitivo (vermelho)

`test/design-system/date-range-picker.contract.ts` + `import` em `test/design-system.contract.test.ts`.

```
$ bun run --cwd apps/frontend-transportada test
error: Cannot find module '../src/components/ui/date-range-picker.tsx'
 5 fail
```

Prova: os 5 testes do contrato quebram porque o primitivo `src/components/ui/date-range-picker.tsx`
ainda não existe — nada do resto da suíte regride.

## T002 — primitivo movido para o design system (vermelho só na dívida prevista)

```
$ bun run --cwd apps/frontend-transportada test
 313 pass
 1 fail
 (design-system/date-range-picker.contract.ts › nenhum *Filters.component.tsx usa type="date")
```

Prova: com o primitivo em `src/components/ui/date-range-picker.tsx` + `.module.css` e os dois usos do
`nfe-workspace` reapontados, 4 dos 5 testes ficam verdes. O único vermelho é a proibição de
`type="date"` nos painéis de filtro — a dívida que as fases B e C fecham, listada em `tasks.md` antes
de começar. Nenhum arquivo em `src/modules/**` declara calendário próprio, e
`nfeWorkspace.module.css` perdeu as 12 regras de calendário que só ele usava.

## T003 — contrato dos filtros de CT-e (vermelho)

`test/cte-batch/filter-date-range.contract.ts` + `import` em `test/cte-batch.contract.test.ts`.

```
$ bun run --cwd apps/frontend-transportada test
 5 fail
 (cte-batch/filter-date-range.contract.ts)
```

Prova: `CteBatchFilters` e `CteItemFilters` ainda importam nada do design system, ainda têm
`type="date"` e os locales `cteBatch` pt/en ainda não têm o grupo `dateRange`.

## T004 — filtros de CT-e ligados no `DateRangePicker` (verde)

```
$ bun run --cwd apps/frontend-transportada test
 314 pass
 1 fail   (só a proibição de type="date", agora apontando MdfeManifestFilters)

$ bun run --cwd apps/frontend-transportada typecheck   # tsc --noEmit — sem saída
$ bun run --cwd apps/frontend-transportada lint         # eslint . — sem saída
$ bun run --cwd apps/frontend-transportada build        # ✓ built
```

Prova: os 5 testes de T003 passam. `DATE_FIELDS` saiu de `CteItemFilters`; `createdFrom`/`createdTo` e
`issuedFrom`/`issuedTo` passam a ser gravados no mesmo `onChange` (o hook usa atualização funcional,
então as duas chamadas de `setTextFilter` não se atropelam). Os campos numéricos de intervalo ficaram
como estavam. O único vermelho restante é o `MdfeManifestFilters`, que a fase C fecha.

## T005 — contrato do filtro de MDF-e (vermelho)

`test/mdfe-manifest/filter-date-range.contract.ts` + `import` em `test/mdfe-manifest.contract.test.ts`.

```
$ bun run --cwd apps/frontend-transportada test
 3 fail
 (mdfe-manifest/filter-date-range.contract.ts)
```

## T006 — filtro de MDF-e ligado e dívida fechada (verde)

```
$ bun run --cwd apps/frontend-transportada test
$ bun test test/frontend-contract.test.ts test/design-system.contract.test.ts ... test/mdfe-manifest.contract.test.ts
bun test v1.3.14 (0d9b296a)

 315 pass
 0 fail
 1713 expect() calls
Ran 315 tests across 14 files. [142.00ms]

$ bun run --cwd apps/frontend-transportada typecheck
$ tsc --noEmit                                  # sem saída

$ bun run --cwd apps/frontend-transportada lint
$ eslint .                                      # sem saída

$ bun run --cwd apps/frontend-transportada build
mode      generateSW
precache  11 entries (831.25 KiB)
files generated
  dist/sw.js
  dist/workbox-e4022e15.js

$ bun run format:check
Checking formatting...
All matched files use Prettier code style!
```

Prova: a suíte inteira fica verde, incluindo a proibição de `type="date"` em qualquer
`*Filters.component.tsx` — não sobrou nenhum painel de filtro com o par de inputs nativos.

### Verificação no navegador real

Stack local (frontend :53000, API :53001, Keycloak :58080), login pelo Playwright com o usuário local,
spec temporária removida ao fim da task.

```
[cte]   inputs nativos de data=0
[cte]   rotulo inicial="Selecione o período"
[cte]   calendario abriu
[cte]   rotulo apos escolher o intervalo="05/07/2026 – 12/07/2026"
[cte]   contador="2 filtro(s) ativo(s)"
[cte]   rotulo apos limpar="Selecione o período"
[cte]   contador apos limpar="0 filtro(s) ativo(s)"
[lotes] rotulo inicial="Selecione o período"
[lotes] calendario abriu
[lotes] rotulo apos um clique="09/07/2026 – …"
[mdfe]  inputs nativos=0
[mdfe]  rotulo inicial="Selecione o período"
[mdfe]  rotulo apos escolher="03/07/2026 – 21/07/2026"
[nfe]   gatilho de periodo presente="Selecione o período"
[nfe]   calendario do design system abriu
[erros] console=[]
1 passed (4.5s)
```

Prova, tela a tela:

- **CT-es da empresa** — zero `input[type="date"]`, calendário abre, escolher dois dias grava o par
  `issuedFrom`/`issuedTo` (o contador vai a `2 filtro(s) ativo(s)`), e "Limpar período" zera os dois de
  uma vez (`0 filtro(s) ativo(s)`).
- **Lotes** — mesmo gatilho, calendário abre e o primeiro clique já mostra o início do intervalo com o
  fim pendente (`09/07/2026 – …`), que é o comportamento de dois passos do primitivo.
- **Manifestos (MDF-e)** — zero input nativo e o intervalo completo escolhido no calendário.
- **Notas (nfe-workspace)** — o filtro de emissão continua funcionando depois da mudança de caminho do
  componente, agora servido pelo primitivo do design system.
- Nenhum erro de console em nenhuma das quatro telas.
