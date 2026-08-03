# Altura e métricas de campo

Todo campo de formulário — `input`, `textarea` e o gatilho de `@/components/ui/select` — tem a
altura, o padding e o corpo de texto vindos dos mesmos tokens. Nenhum módulo inventa a sua própria
métrica de campo.

## Por quê

Cada módulo tinha nascido com a sua própria altura: o select do design system em `3rem`, os
formulários de frota e de manifesto em `2.75rem`, as linhas de condição em `2.5rem`, e o campo de
texto do modal de emissão de CT-e sem `min-height` nenhum — ele encolhia até o padding. Colocados
lado a lado na mesma grade (`NOME DO LOTE` ao lado de `PERFIL DE EMISSÃO` e `AGRUPAMENTO`), os
campos fechavam em alturas diferentes. Com um token compartilhado a linha fecha sozinha, e mudar a
métrica é mudar uma declaração.

## Tokens

Declarados em `:root`, em `apps/frontend-transportada/src/styles/index.css`:

```css
--field-height: 3rem;
--field-height-compact: 2.4rem;
--field-padding: var(--space-3);
--field-padding-compact: var(--space-2) var(--space-3);
--field-font-size: 0.9rem;
--field-font-size-compact: 0.82rem;
```

- **Métrica cheia** (`--field-height`, `--field-padding`, `--field-font-size`): formulários, modais,
  qualquer campo que o usuário preenche olhando para ele. É a mesma altura do gatilho de select
  padrão, então campo e select fecham na mesma linha.
- **Métrica compacta** (`*-compact`): barras de filtro, linhas de condição de regra, listas densas.
  É a mesma altura do `triggerCompact` do select.

## Como usar

```css
.fieldGrid input,
.fieldGrid textarea {
  min-height: var(--field-height);
  padding: var(--field-padding);
  font-size: var(--field-font-size);
}

.filterBar input {
  min-height: var(--field-height-compact);
  padding: var(--field-padding-compact);
  font-size: var(--field-font-size-compact);
}
```

## Rótulo em grade ancora no topo

Rótulo de campo é `display: grid` (legenda em cima, controle embaixo) e por isso **precisa** de
`align-content: start`. Sem isso, quando a grade do formulário tem duas ou mais colunas e a célula
vizinha é mais alta — um campo com botão ao lado, uma legenda que quebra em duas linhas — a célula
estica e o controle absorve a sobra. Foi assim que "Máximo de tentativas" em
`/company-settings` chegou a 70px ao lado de um campo de 48px.

```css
.fieldGrid label {
  display: grid;
  gap: var(--space-1);
  align-content: start;
}
```

## Campo composto: a moldura carrega a métrica

Quando o campo é uma moldura com ícone mais `input` sem borda (a busca da tabela de notas,
`.tableSearch`), a métrica vai na moldura — `min-height: var(--field-height-compact)` — e o `input`
interno fica sem altura própria. Nunca fixe `height` na moldura: um `min-height` deixa o campo
crescer se o conteúdo exigir.

## Exceções permitidas

Só duas, e o contrato conhece as duas:

- `min-height: 5rem` em `textarea` de texto longo (justificativa de cancelamento, observação de
  manifesto) — a altura cheia ali é área de escrita, não métrica de campo.
- `min-height: 0` no `input[type='file']` visualmente escondido, que precisa continuar com 1px.

Qualquer outro valor literal de `min-height` em seletor de `input`/`textarea` derruba
`test/design-system/field-metrics.contract.ts`.

## Contrato

`apps/frontend-transportada/test/design-system/field-metrics.contract.ts` varre todo `.css` sob
`src/` e verifica que:

1. os seis tokens estão declarados em `:root`;
2. cada folha de estilo que dimensiona campo usa `min-height: var(--field-height…)`;
3. nenhuma regra de `input`/`textarea` declara altura fora dos tokens (salvo as exceções acima);
4. quem usa uma altura usa também o padding e o corpo de texto da mesma métrica — as três juntas;
5. todo rótulo em grade declara `align-content: start`;
6. o campo do modal de emissão de CT-e usa a métrica cheia, ao lado dos selects;
7. as barras de filtro e a moldura de busca usam a métrica compacta;
8. esta página existe e o `CLAUDE.md` aponta para ela.
