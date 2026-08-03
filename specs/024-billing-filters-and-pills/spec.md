# Feature 024 — Filtros da tela de faturamento: pílulas, faixa de CT-e e número da nota

## Problema e resultado

A feature 023 deixou a aba **Gerar fatura** no contrato de tabela densa, mas o uso real da tela expôs
quatro furos, todos levantados pelo operador na mesma sessão:

1. **Filtro de CT-e não faz o que o operador precisa.** `parseCteNumberList` aceita só lista separada por
   vírgula (`billingEligibleFilterValue.service.ts`), não aceita faixa (`10 até 40`), e quando a entrada
   é inválida devolve `undefined` — o filtro simplesmente **não é aplicado, sem dizer nada**. Quem digita
   `10-40` vê a lista inteira e acredita que não existe CT-e naquela faixa.
2. **Não há pílulas do que está filtrado.** A única tabela do repositório com pílulas removíveis é a de
   Notas (`NfeDocumentTable.component.tsx:694`); nas demais o operador só sabe que há filtro pelo número
   no badge do botão, sem saber **qual**, e só pode desfazer tudo de uma vez.
3. **O checkbox aparecia como um quadrado branco** sobre o tema escuro — widget nativo sem
   `appearance: none` e sem `color-scheme` declarado.
4. **Não dá para filtrar pelo número da nota.** O CT-e nasce de uma NF-e (`cte_batch_items.nfe_document_id`),
   e é pelo número da nota que o cliente cobra explicação — mas nem a listagem devolve esse número nem a
   API aceita filtrar por ele.

**Resultado esperado:** o campo de CT-e aceita `3, 7, 10-40` e diz quando a entrada é inválida; existe o
mesmo campo para número de nota; a tela mostra uma pílula removível por filtro aplicado; e o checkbox é o
do design system em toda tabela do produto.

## Fora de escopo

- Ordenação no servidor e troca do cursor da paginação — limitação registrada na 023, segue valendo.
- Filtro por faixa/lista em outras telas além da aba **Gerar fatura** (a de Notas e a de CT-es continuam
  como estão; só ganham pílulas).
- Mais de uma faixa por campo. `3, 7, 10-40, 90-95` é recusado com mensagem; uma faixa por campo basta
  para o caso real e mantém a query com um único `BETWEEN`.
- Índice novo em `nfe_documents.number` — a comparação é por expressão e não usa índice hoje; medir antes
  de criar, registrado como limitação.
- Mudar regra de elegibilidade, numeração, total, PDF ou cancelamento.

## Decisões tomadas

| Questão                       | Decisão                                                                                                                           | Consequência                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde mora o checkbox          | Componente único `@/components/ui/checkbox`, `<input type="checkbox">` cru proibido em `src/**/*.tsx`                             | Um só desenho para 14 arquivos; contrato falha se algum voltar.                                                                                     |
| Por que o quadrado era branco | Faltava `appearance: none` **e** `color-scheme` — `accent-color` sozinho não repinta a moldura do widget                          | `:root` passa a declarar `color-scheme: dark`; os módulos param de dimensionar o input nativo.                                                      |
| Sintaxe do campo de números   | Um campo por domínio aceitando `3, 7, 10-40`: valores soltos e **uma** faixa                                                      | É como o operador fala. Evita três campos (exato, lista, de/até) na mesma linha.                                                                    |
| Como isso vira query          | Valores soltos → `cteNumberIn`; a faixa → `cteNumberFrom` + `cteNumberTo`; os dois presentes são combinados por **OU** no `WHERE` | Lista e faixa são alternativas do mesmo domínio, não restrições que se anulam.                                                                      |
| Entrada inválida              | O parser devolve erro tipado e o campo mostra a mensagem; **nunca** cai para "sem filtro"                                         | O furo atual é justamente o silêncio.                                                                                                               |
| Conflito de parâmetros        | `cteNumber` (exato) conflita com `cteNumberIn` e com a faixa; `cteNumberFrom` e `cteNumberTo` só valem juntos                     | Mesma regra da allowlist de 023, estendida. Faixa pela metade é `400`, não meia-verdade.                                                            |
| Filtro por número da nota     | `nfeNumberIn`, `nfeNumberFrom`, `nfeNumberTo`, com a mesma sintaxe e as mesmas regras de conflito                                 | Simetria com CT-e: um jeito só de escrever filtro de número na tela.                                                                                |
| Como comparar número de nota  | `nfe_documents.number` é `text` sem zero à esquerda no banco; comparar por `lpad(number, 9, '0')` dos dois lados                  | `::bigint` quebraria a query inteira num único registro não numérico. `lpad` compara igual para `007` e `7`.                                        |
| De onde sai o número da nota  | Join novo com `nfe_documents` por `(company_id, id = cte_batch_items.nfe_document_id)`                                            | O join com `nfe_participants` já usa esse mesmo id: o vínculo existe, só não era projetado.                                                         |
| Coluna nova na tabela         | `nfeNumber` entra na projeção e vira coluna visível por padrão                                                                    | Filtrar por algo que a tabela não mostra seria filtro cego.                                                                                         |
| Pílulas                       | Componente `@/components/ui/filter-pills`, alimentado por descritores puros do `*.service.ts` de cada módulo                      | A tabela de Notas monta pílula dentro do `.component.tsx`, contra a regra "lógica no hook/serviço" — a versão compartilhada corrige isso ao migrar. |
| Alcance das pílulas           | Elegíveis do billing, Notas, faturas emitidas, CT-es do lote, lotes e manifestos                                                  | A regra entra em `docs/frontend/data-tables.md` na mesma feature em que todas as tabelas passam a cumpri-la.                                        |
| Teto de valores               | 100 valores soltos por campo (o `LIST_FILTER_MAX_VALUES` que já existe); faixa não expande em lista                               | Faixa `1-9000` continua sendo dois números na URL.                                                                                                  |

## Critérios de aceite

**Checkbox (fase A, concluída)**

- Nenhum `<input type="checkbox">` cru em `src/**/*.tsx` fora de `components/ui/checkbox.tsx`.
- Caixa quadrada com preenchimento `--color-copper` quando marcada, traço quando indeterminada, anel de
  foco de cobre, área de toque de 44px em ponteiro grosso, só tokens no CSS.
- Cabeçalho de toda tabela mostra estado indeterminado quando a seleção da página é parcial.
- `:root` declara `color-scheme: dark`; nenhum módulo dimensiona o input nativo nem usa `accent-color`.

**Campo de números (CT-e e nota)**

- `3, 7, 10-40` aplica `número ∈ {3,7} OU 10 ≤ número ≤ 40`; espaços e separador `–`/`até` aceitos.
- Entrada inválida (letra, faixa invertida, mais de uma faixa, mais de 100 valores) mostra mensagem no
  campo e **não** dispara consulta; nada de filtro silenciosamente ignorado.
- Limpar o campo remove o filtro; o botão de limpar tudo continua zerando os dois campos.

**API**

- `GET /billing/eligible-ctes` aceita `cteNumberFrom`, `cteNumberTo`, `nfeNumberIn`, `nfeNumberFrom` e
  `nfeNumberTo`; rejeita com `400` chave fora da allowlist, chave repetida, lista vazia, lista acima do
  teto, faixa pela metade, faixa invertida e exato combinado com lista ou faixa do mesmo domínio.
- Lista e faixa do mesmo domínio presentes juntas resultam em **OU** entre elas, nunca em interseção.
- A resposta passa a trazer `nfeNumber` por CT-e elegível.
- A query filtra por `companyId` do contexto e tem teste de isolamento em
  `test/billing-schema/tenant-safety.contract.ts` cobrindo os filtros novos.

**Pílulas**

- Cada filtro aplicado vira uma pílula com rótulo `campo: valor` e botão de remover só aquele filtro;
  o filtro avançado vira uma pílula própria, com editar e remover.
- O badge de contagem do botão de filtros usa o número de pílulas no modo simples.
- As pílulas existem nas seis tabelas listadas e a regra está escrita em `docs/frontend/data-tables.md`.
- Todo texto vem do locale; nenhum hex, px mágico ou `<select>` nativo.

**Transversais**

- Dinheiro em `Decimal`/`numeric`; `companyId` sempre do contexto autenticado.
- Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em teste,
  fixture, log ou evidência.
