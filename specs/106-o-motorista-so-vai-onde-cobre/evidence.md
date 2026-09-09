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

## A tradução do cadastro (segunda leva)

`resolveServableStops` (`routing/domain/servable-stops.policy.ts`) traduz o cadastro em conjunto
servível, com **a regra de fallback decidida pelo usuário**: motorista **sem região cadastrada serve
tudo** (`null`). Instalação que nunca configurou região continua funcionando igual a hoje — conjunto
vazio ali faria o roteirizador parar de propor viagem sem ninguém entender por quê.

A política de zona virou **cópia por valor** no worker
(`routing/domain/region-coverage.policy.ts`), com uma diferença deliberada: código malformado devolve
`null` em vez de lançar. Aqui é leitura de dado já gravado, e derrubar a roteirização inteira por uma
linha velha de importação seria trocar roteiro imperfeito por roteiro nenhum.
`test/driver-coverage/policy-parity.contract.ts` compara **comportamento**, não texto — comparar
linha a linha proibiria justamente essa diferença.

Mais: schema das três tabelas copiado para o worker (padrão dos outros quatorze), `driverId` na
leitura da frota da sugestão, cidade e UF viajando com a parada do pool, e as duas consultas de
cadastro — **uma por execução**, nunca por parada.

Seis contratos novos: fallback sem cadastro, zona acumulativa, família diferente, cidade solta fora
da zona, cidade fora da tabela virando sobra, e o casamento pela dobra do acento.

## A costura (terceira leva) — e o teste que faltava

O elo estava aberto e **nenhum teste acusava**: política, tradução, schema e consultas passavam
sozinhos, e `servableStopIndexes` chegava `null` ao solver. A proibição existia e não restringia
nada. A prova era literal — `grep` por chamador das três funções devolvia **zero**, e o veículo
recebia `servableStopIndexes: null` fixo em duas linhas.

`test/driver-coverage/wiring.contract.ts` é o contrato dessa costura, e ele existe justamente porque
peça verde isolada não prova corrente ligada.

**A costura mora no efeito, não no repositório**: o índice da parada só existe lá. ⚠️
`index: offset + 1`, porque `points[0]` é o depósito — errar o deslocamento restringiria o veículo à
parada errada, calado.

O repositório passou a ler o cadastro em **duas consultas por execução**, e só quando há motorista
pareado: a sugestão da véspera, sem escala, não paga por elas.

## Verificação de que a corrente fechou

```
grep readDriverCoverage|readRegionCityCodes|resolveServableStops  → 4 chamadores
servableStopIndexes fixo no efeito                                → virou resolveServableStops(...)
worker  bun run test                                              → 969 pass / 0 fail
make check                                                        → exit 0
```

## Um susto que vale registrar

Um `git checkout --` para desfazer um regex que foi longe demais no repositório levou junto as duas
consultas já escritas. Refazer custou uma rodada. A lição é sobre a ferramenta, não sobre o código:
regex amplo em arquivo de 900 linhas não se desfaz com `checkout` sem perder o trabalho bom junto.
