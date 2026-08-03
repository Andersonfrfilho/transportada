# Plano — Feature 020

## Camadas tocadas

Só frontend. Nenhuma rota, nenhum use-case, nenhuma query, nenhuma migration. A API não muda, então
não há teste de isolamento de tenant nesta feature — nenhuma task mexe em query.

| Arquivo                                                  | Ação    | Papel                                                      |
| -------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| `src/components/ui/tabs.tsx`                             | novo    | Primitivo de abas do design system (`Tabs`, `TabsItem`).   |
| `src/components/ui/tabs.module.css`                      | novo    | Skin das abas, só com tokens de `:root`.                   |
| `src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx` | editado | Passa a montar as duas abas em vez de empilhar as tabelas. |
| `src/modules/cte-batch/locales/cteBatch.locale.json`     | editado | Chaves `tabs.documents` e `tabs.batches`.                  |
| `src/modules/cte-batch/locales/cteBatch.en.locale.json`  | editado | Mesmas chaves em inglês.                                   |
| `test/design-system/tabs.contract.ts`                    | novo    | Contrato do primitivo + proibição de abas paralelas.       |
| `test/design-system.contract.test.ts`                    | editado | `import` da suíte nova.                                    |
| `test/cte-batch/workspace-tabs.contract.ts`              | novo    | Contrato da montagem da tela em abas.                      |
| `test/cte-batch.contract.test.ts`                        | editado | `import` da suíte nova.                                    |

Os dois entrypoints (`design-system.contract.test.ts`, `cte-batch.contract.test.ts`) já estão na
lista explícita do `test` do `package.json` da app — nenhuma task precisa mexer no `package.json`.

## Estilo dos contratos

As suítes de contrato do frontend leem o código-fonte como texto (é assim que
`design-system/select.contract.ts` prova ARIA e teclado, e é assim que as suítes de `cte-batch`
provam a fronteira de apresentação). As tasks seguem o mesmo estilo: nada de DOM simulado, nada de
dependência nova.

## Ordem

A → B. A entrega o primitivo; B liga a tela nele. B não compila antes de A existir, então não há
paralelismo real entre as duas fases.
