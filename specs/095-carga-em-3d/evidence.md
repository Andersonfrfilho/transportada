# Evidência — 095

## Contratos escritos antes da implementação

| História               | Contrato                                                  | Casos                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G001 fatia por parada  | `api/test/cargo-placement/slices.contract.ts`             | faixa própria sem sobreposição · nenhuma coluna compartilhada entre paradas · fatia por volume e não por contagem · parada única ocupa o baú                                              |
| G002 medida embaixo    | idem, `a ordem dentro da fatia`                           | medida nunca acima de presumida · pegada maior nunca sobre menor · frágil acima até da presumida                                                                                          |
| G003 carga dividida    | idem, `a carga dividida`                                  | sobra mais funda que a própria fatia · nada em cima dela · nunca empurrada para a porta                                                                                                   |
| G004 isométrico        | `frontend/test/design-system/cargo-isometric.contract.ts` | `zM` sobe na tela · profundidade inverte com o giro · faces trocam aos pares · vista por baixo só com pitch negativo · sem hachura                                                        |
| G005 girar e enquadrar | `frontend/test/trip/cargo-view.contract.ts`               | lateral mira a porta lateral · tombo travado · volta livre · arrasto no sentido do botão · zoom com piso e teto · mover não gira · restaurar desfaz tudo · reduced-motion e alvo de toque |
| G006 isolar parada     | `frontend/test/trip/stop-focus.contract.ts`               | vazio acende todas · multisseleção · desligar a última devolve o baú · sem mutação · fantasma cinza e não escondido                                                                       |
| G007 legenda           | `frontend/test/trip/cargo-legend.contract.ts`             | divisa onde a parada começa e nunca na testeira · parada única sem divisa · quase nada medido ≠ algo presumido · baú vazio não avisa · legenda nomeia as três marcas                      |

## Execução

```
apps/frontend-transportada  →  2994 pass · 0 fail  (24 arquivos)
apps/api-transportada       →  4656 tests · 0 fail · 23 skip (159 arquivos)
typecheck (raiz)            →  limpo
lint (raiz, --max-warnings=0) →  limpo
```

## Defeitos encontrados no caminho

- **`MAX_SPLIT_BOXES` aplicado no lugar errado.** A substituição pegou as duas ocorrências de
  `placed.length >= input.budget` e passou a limitar **o empacotador da fatia** a 40 caixas, não só a
  divisão. Sintoma: a caixa frágil saía como `tooMany` num baú com 40 caixas dentro. Três contratos
  da 094 pegaram, e o desempenho do empacotador (50 ms para 300 notas) foi o que apontou o custo real
  da busca de lugar para a sobra.
- **O `viewBox` com zoom aplicado na origem** faz o desenho fugir para o canto a cada clique: a caixa
  de visão cresce, e é o centro dela que tem de ficar parado.
