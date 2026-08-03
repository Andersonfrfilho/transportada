# Feature 020 — Workspace de CT-e em abas, com a tabela de CT-es como principal

## Problema e resultado

A tela `Lotes de CT-e` empilha hoje três blocos, um debaixo do outro, no mesmo scroll:

1. a tabela **Lotes** (com filtros, colunas configuráveis e ações por lote);
2. o painel **CT-es do lote X**, que abre quando o operador clica em `Ver CT-es`;
3. a tabela **CT-es da empresa** (a tabela transversal, com seleção em massa, soma de base e total
   entre páginas e paginação por cursor).

Os três nasceram em features diferentes (017 trouxe o item workspace) e nunca foram reconciliados
como uma tela só. O resultado é uma página muito longa: o operador rola para achar a tabela que usa
mais, e as duas tabelas competem por atenção — cada uma com sua própria barra de filtros, seu próprio
menu de colunas e sua própria barra de seleção.

Na operação real quem manda é a tabela transversal: é dela que sai a conferência de valores
(`Base selecionada` / `Total selecionado`) e o acompanhamento de quem já foi transmitido. A tabela de
lotes é o passo anterior — usada no momento de submeter ou cancelar, não o tempo todo.

**Resultado esperado:** a tela passa a ter duas abas. A aba **CT-es** é a padrão e abre primeiro, com
a tabela transversal da empresa. A aba **Lotes** guarda a tabela de lotes e o painel de itens do lote
aberto. Nada de comportamento das duas tabelas muda — muda só onde cada uma mora.

## Fora de escopo

- Qualquer mudança nas colunas, filtros, ordenação, paginação ou seleção das duas tabelas.
- O número do CT-e vir preenchido antes da transmissão. Confirmado no código que
  `Número do CT-e` é `coalesce(cte_fiscal_documents.fiscal_number, <última tentativa>.fiscal_number)`
  (`drizzle-cte-batch-item.repository.ts:252`) e que a numeração é reservada em
  `reserveFiscalNumber` no momento da emissão — item pendente exibir `—` é o comportamento correto,
  não um defeito.
- Persistir a aba escolhida entre sessões. A aba padrão é sempre `CT-es`.

## Decisões tomadas

| Questão                             | Decisão                                                               | Consequência                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onde vive o componente de abas      | No design system, `src/components/ui/tabs.tsx`                        | A regra do repo proíbe UI paralela ao design system sem ADR. Abas são um primitivo transversal — a próxima tela que precisar reusa em vez de reimplementar.              |
| Aba padrão                          | `CT-es` (tabela transversal da empresa)                               | É a tabela que o operador usa o tempo todo; a de lotes é o passo pontual de submeter/cancelar.                                                                           |
| Onde fica o painel de itens do lote | Dentro da aba `Lotes`, logo abaixo da tabela de lotes                 | Ele é aberto por uma ação da própria tabela de lotes (`Ver CT-es`); separar os dois quebraria o vínculo visual entre o clique e o que abriu.                             |
| Como a aba é montada                | Só o painel ativo é renderizado                                       | As duas tabelas têm query própria com cursor e preferências de coluna; manter a inativa montada dispararia refetch e escrita de preferências de uma tela que ninguém vê. |
| Acessibilidade                      | `role="tablist"` / `role="tab"` / `role="tabpanel"`, setas + Home/End | Mesmo padrão já cobrado do `Select` pelo contrato de design system.                                                                                                      |
| Estado da aba                       | `useState` na página                                                  | Não há router no frontend; refletir aba na URL exigiria mexer na navegação manual de `main.tsx` — fora do escopo desta feature.                                          |

## Critérios de aceite

- A tela renderiza uma `tablist` com exatamente duas abas, rotuladas pelos locales `tabs.documents` e
  `tabs.batches`, nesta ordem.
- Ao abrir a tela, a aba `CT-es` está selecionada (`aria-selected="true"`) e a tabela transversal é a
  única renderizada; a tabela de lotes **não** está no DOM.
- Ao ativar a aba `Lotes`, a tabela de lotes é renderizada e, se houver lote aberto, o painel de itens
  aparece abaixo dela; a tabela transversal sai do DOM.
- O componente de abas do design system expõe teclado (`ArrowLeft`, `ArrowRight`, `Home`, `End`) e
  ARIA (`aria-selected`, `aria-controls`, `role="tabpanel"`).
- Nenhum módulo declara sua própria implementação de abas — o contrato de design system falha se
  reaparecer `role="tablist"` fora de `src/components/ui/tabs.tsx`.
- Os gates de permissão continuam valendo: quem não pode ler itens (`canReadItems` falso) não vê a aba
  `CT-es`; quem não pode gerenciar nem submeter lote continua vendo só a mensagem `forbidden`.
