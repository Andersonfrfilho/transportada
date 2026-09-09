# Evidência 106 — O motorista só vai onde ele cobre

## O defeito que a spec descobriu no caminho

⚠️ **"Rota vazia" era o ótimo global do solver, e ninguém sabia.**

Ao implementar a proibição, o solver passou a devolver as duas rotas **vazias** e as oito paradas na
sobra. A causa não era a cobertura: o fitness soma custo e penalidade, e uma rota sem paradas tem os
dois em **zero** — não entregar nada era, literalmente, a melhor solução possível.

Antes desta spec nenhum caminho conseguia perder um gene, então o ótimo degenerado era inalcançável e
invisível. Bastou o reparo de cobertura abrir a possibilidade para o GA encontrá-lo: **48 gerações**
até a população inteira convergir para o cromossomo `[-1]`.

Duas correções, e a segunda é a que importa:

1. `repairCoverage` **nunca descarta**: sem destino, a parada fica onde está e a avaliação a acusa.
2. `totalFitness` **penaliza parada largada**, da ordem do par inalcançável. Entregar caro sempre
   vence não entregar. Sem isso, qualquer operador futuro que perca um gene volta a vencer.

O solver estava certo o tempo todo. A função objetivo é que não sabia que largar carga é proibido.

## Gates

```
worker  bun run test         956 pass / 0 fail
worker  typecheck · eslint   limpos
```

Benchmark sem regressão (mesma nuvem, mesma semente, 30 s):

| paradas | gerações | qualidade   |  km |    s |
| ------: | -------: | ----------- | --: | ---: |
|     100 |       59 | `optimized` | 457 |  1,6 |
|     200 |       97 | `optimized` | 638 |  5,5 |
|     305 |      121 | `optimized` | 800 | 13,5 |

## Contratos

Cinco casos, escritos antes: parada fora da cobertura não entra na rota; parada que ninguém cobre
volta como sobra (**cumprindo a ADR-0044 §5**, que prometia isso e nunca teve caminho ativo); veículo
sem cobertura declarada serve tudo; cobertura **vazia** não serve nada (o oposto de `null`); e a
sobra do restrito cabe no veículo livre.

## Decisões que ficaram no código

- **A cobertura chega como conjunto de índices, não como código de zona.** O solver é puro e não
  conhece família nem zona acumulativa; quem traduz é o repositório, com o mesmo `coversRegion` que a
  tabela de frete usa.
- **`null` é ausência de restrição, conjunto vazio é "não serve nada"** — coisas opostas.
- **A parada que ninguém cobre nunca entra no cromossomo.** Mantê-la lá faria os operadores genéticos
  passeá-la entre veículos que não podem servi-la, e quebraria o _order crossover_, que exige o mesmo
  conjunto de genes nos dois pais.
- **O reparo vem antes da busca local**: 2-opt sobre rota com parada proibida otimizaria a ordem de
  algo que vai mudar de veículo em seguida.
- **O reparo também roda no `buildSolution`**, não só no `refine`: a instância trivial entra por outro
  caminho, e uma solução final que ignora a proibição a tornaria mentira onde ela é lida.

## O que falta para isto valer em produção

⚠️ **`servableStopIndexes` chega `null` dos dois repositórios.** A infraestrutura do solver está
pronta e testada, mas **ninguém a preenche ainda**: falta traduzir `fleet_driver_regions` +
`coversRegion` em conjunto de índices no efeito de otimização. Sem isso a proibição existe e não
restringe nada — e é o próximo passo desta spec.
