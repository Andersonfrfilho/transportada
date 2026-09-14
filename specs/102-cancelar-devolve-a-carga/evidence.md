# Evidência 102 — Cancelar devolve a carga

## Medições

| quando                             | o quê                                             | resultado |
| ---------------------------------- | ------------------------------------------------- | --------- |
| antes da migration                 | viagens canceladas na base local                  | **0**     |
| depois de cancelar as 12 pela tela | notas presas (`released_at is null`)              | **0**     |
| mesma hora                         | vínculos liberados **ainda visíveis** na listagem | **324**   |

A terceira linha é o achado da D0: o dado estava certo e a leitura estava errada.

## Gates

```
make check            exit 0
make migration-test   exit 0 · 91 pass / 0 fail (migration + rollback em Postgres descartável)
api                   4827 pass / 0 fail / 23 skip
frontend              3087 pass / 0 fail
```

## Contratos escritos antes da implementação

| arquivo                                                       | o que tranca                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `test/cancel-releases-cargo/use-case.contract.ts`             | idempotência, `completed` recusada, ausência                                       |
| `test/cancel-releases-cargo/persistence.contract.ts`          | recorte da escrita, nota entregue fora, **a linha não é apagada**, mesma transação |
| `test/cancel-releases-cargo/trip-link.contract.ts`            | o vínculo liberado some da listagem (D0)                                           |
| `test/cancel-releases-cargo/selection.contract.ts` (frontend) | interseção da seleção, poda por página, estado do cabeçalho                        |

## Defeitos que os contratos e o repositório pegaram

1. O use case passava o **`input` inteiro** — incluindo o repositório — para `markCancelled`. Inócuo
   hoje, e exatamente o tipo de objeto que acaba num log. Apertado para os dois campos declarados.
2. `action-icons.contract.ts` reprovou dois botões meus sem ícone.
3. `static-migration.contract.ts` reprovou a migration não declarada — ela lista todas por extenso
   justamente para isso.
4. O arquivo de teste caiu no script `db:test` em vez de `test`, e
   `test-registry/declaration.contract.ts` pegou.
5. ⚠️ **Meu, e nenhum contrato pegou:** os checkboxes novos usavam `aria-label` onde o componente
   espera `ariaLabel` — ficaram **sem nome acessível**. Achado por leitura ao investigar outra
   coisa. Não há contrato que cubra isso hoje.

## Fora de escopo, registrado

- Filtro de situação na listagem (exige `statuses[]` na rota — o `statusEq` de hoje é um valor só).
- Contagem de notas por viagem na listagem, que o diálogo de confirmação usaria.
- Tela de histórico da nota: o dado sobrevive para ela existir, mas `nfe-documents` não lê
  `trip_documents`.
