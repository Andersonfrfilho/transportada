# Plano — Feature 021

## Camadas tocadas

Só frontend. Nenhuma rota, nenhum use-case, nenhuma query, nenhuma migration, nenhum contrato de API.
Nenhuma task mexe em query — logo não há teste de isolamento de tenant nesta feature.

| Arquivo                                                                    | Ação     | Papel                                                       |
| -------------------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `src/components/ui/date-range-picker.tsx`                                  | novo     | Primitivo de período do design system (`DateRangePicker`).  |
| `src/components/ui/date-range-picker.module.css`                           | novo     | Skin do calendário, só com tokens de `:root`.               |
| `src/modules/nfe-workspace/components/DateRangePicker.component.tsx`       | removido | Vira o primitivo acima.                                     |
| `src/modules/nfe-workspace/components/NfeDocumentTable.component.tsx`      | editado  | `import` passa a apontar para o design system.              |
| `src/modules/nfe-workspace/components/AdvancedFilterBuilder.component.tsx` | editado  | Mesma troca de `import`.                                    |
| `src/modules/nfe-workspace/styles/nfeWorkspace.module.css`                 | editado  | Saem as regras que só o calendário usava.                   |
| `src/modules/cte-batch/components/CteBatchFilters.component.tsx`           | editado  | Par `createdFrom`/`createdTo` vira um `DateRangePicker`.    |
| `src/modules/cte-batch/components/CteItemFilters.component.tsx`            | editado  | Par `issuedFrom`/`issuedTo` vira um `DateRangePicker`.      |
| `src/modules/cte-batch/locales/cteBatch{,.en}.locale.json`                 | editado  | Grupo `dateRange`.                                          |
| `src/modules/mdfe-manifest/components/MdfeManifestFilters.component.tsx`   | editado  | Par `createdFrom`/`createdTo` vira um `DateRangePicker`.    |
| `src/modules/mdfe-manifest/locales/mdfeManifest{,.en}.locale.json`         | editado  | Grupo `dateRange`.                                          |
| `test/design-system/date-range-picker.contract.ts`                         | novo     | Contrato do primitivo + proibição de calendário/par nativo. |
| `test/design-system.contract.test.ts`                                      | editado  | `import` da suíte nova.                                     |
| `test/cte-batch/filter-date-range.contract.ts`                             | novo     | Contrato dos dois filtros de CT-e.                          |
| `test/cte-batch.contract.test.ts`                                          | editado  | `import` da suíte nova.                                     |
| `test/mdfe-manifest/filter-date-range.contract.ts`                         | novo     | Contrato do filtro de MDF-e.                                |
| `test/mdfe-manifest.contract.test.ts`                                      | editado  | `import` da suíte nova.                                     |

Os três entrypoints (`design-system`, `cte-batch`, `mdfe-manifest`) já estão na lista explícita do
`test` do `package.json` da app — nenhuma task precisa mexer no `package.json`.

## Estilo dos contratos

Igual ao resto do frontend: as suítes leem o código-fonte como texto (`Bun.file(...).text()`), sem DOM
simulado e sem dependência nova. É como `design-system/select.contract.ts` e
`design-system/tabs.contract.ts` já provam ARIA, teclado e proibições transversais.

## Ordem

A → B → C. A entrega o primitivo; B e C ligam os filtros nele e só então a proibição de
`type="date"` em painel de filtro fecha em verde. A proibição nasce em A justamente para apontar,
uma por uma, as telas que ainda faltam — é o mesmo desenho da Fase C da feature 020.
