# Loading

Nenhuma tela troca de "vazio" para "conteúdo" de uma vez — isso é o piscar (flash) que o usuário
vê como bug. Todo estado de carregamento (`isLoading` de query, gate de página, painel, tabela,
diálogo) renderiza um esqueleto vindo de `@/components/ui/skeleton`, nunca um texto solto
("Carregando…") nem `null`.

`<Skeleton>` é só a barra decorativa (`aria-hidden`); quem compõe o layout é cada tela. O
princípio não-negociável: **o esqueleto tem a mesma forma do conteúdo real que ele antecede** —
mesma contagem de linhas/colunas, mesma altura de campo, mesmo espaçamento. Um bloco cinza
genérico do tamanho errado ainda pisca, só que mais devagar.

## Props de `Skeleton`

| Prop      | Tipo                             | Papel                                                      |
| --------- | -------------------------------- | ----------------------------------------------------------- |
| `variant` | `'text' \| 'block' \| 'circle'`  | `text` para linha de texto, `circle` para avatar/ícone, `block` para retângulo genérico (padrão). |
| `width`   | `string`                         | Qualquer valor CSS válido (`'100%'`, `'8rem'`, `var(--space-16)`) — dimensione pelo que a barra substitui, não por um valor arbitrário. |
| `height`  | `string`                         | Idem. Combine com `--field-height`/`--field-height-compact` quando o esqueleto está no lugar de um campo. |

`SkeletonGroup` embrulha a composição inteira com `role="status"` e `aria-label` (reuse a chave de
locale já existente, ex. `t('loading')`) — é o único ponto que anuncia "carregando" para leitor de
tela; as barras individuais ficam `aria-hidden` para não duplicar o anúncio.

## Como compor por tipo de tela

- **Tabela**: uma linha de esqueleto por linha esperada (3–5 é o suficiente), uma célula de
  esqueleto por coluna visível — mesma grade/larguras da `<table>` real, não uma barra única.
- **Painel/formulário**: uma barra por campo, com `height` igual ao campo real
  (`--field-height`/`--field-height-compact`) e `width` variando por campo (rótulo curto → largura
  menor) para não parecer uma grade uniforme.
- **Cabeçalho/heading**: uma barra `text` só, do tamanho aproximado do texto que vai aparecer —
  não esqueletiza o layout inteiro da página quando só uma seção está carregando.
- **Diálogo/lista**: uma linha de esqueleto por item esperado, repetindo a estrutura de uma linha
  real (ícone + texto + valor), não um bloco.

## Exemplo

```tsx
{query.isLoading ? (
  <SkeletonGroup className={styles.tableBody} label={t('loading')}>
    {Array.from({ length: 4 }, (_, index) => (
      <div className={styles.skeletonRow} key={index}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="30%" />
        <Skeleton height="var(--field-height-compact)" width="20%" />
      </div>
    ))}
  </SkeletonGroup>
) : (
  <RealTable items={query.data} />
)}
```

`<input type="checkbox">`, `<select>` e `<svg>` cru são proibidos em `src/**/*.tsx` pelos seus
próprios contratos — texto solto de carregamento (`<p>{t('loading')}</p>` como única UI do estado
`isLoading`) segue a mesma lógica e é proibido pelo contrato
`test/design-system/skeleton.contract.ts`.
