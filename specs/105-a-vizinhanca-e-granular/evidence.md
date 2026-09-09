# Evidência 105 — A vizinhança é granular

## Medição

Mesma nuvem sintética, mesma semente, orçamento de 30 s:

| paradas | veículos | gerações | qualidade   |   km | segundos |
| ------: | -------: | -------: | ----------- | ---: | -------: |
|      20 |        3 |       40 | `optimized` |  269 |      0,2 |
|      50 |        4 |       44 | `optimized` |  374 |      0,5 |
|     100 |        5 |       59 | `optimized` |  457 |      1,5 |
|     200 |        6 |       97 | `optimized` |  638 |      5,9 |
|     305 |        6 |      121 | `optimized` |  800 |     14,0 |
|     500 |        8 |      129 | `partial`   | 1020 |     30,1 |
|    1000 |       12 |        1 | `partial`   | 1579 |     30,3 |

Contra a medição da spec 104 (mesmo script, mesma máquina):

| paradas | antes                   | depois                    | ganho                           |
| ------: | ----------------------- | ------------------------- | ------------------------------- |
|     100 | 8 ger · 30,0 s · 465 km | 59 ger · 1,5 s · 457 km   | 20× mais rápido                 |
|     200 | 0 ger · 30,0 s · 678 km | 97 ger · 5,9 s · 638 km   | de gulosa a otimizada, −5,9% km |
|     305 | 0 ger · 30,0 s · 856 km | 121 ger · 14,0 s · 800 km | de gulosa a otimizada, −6,5% km |

## Gates

```
make check                   exit 0
worker  bun run test         951 pass / 0 fail
worker  typecheck · eslint   limpos
```

Os testes de referência do solver — que comparam com ótimos publicados e com o baseline
vizinho-mais-próximo + `2-opt` — **continuam passando**. A granularidade não degradou as instâncias
pequenas, que é o risco real de restringir a vizinhança.

## Um defeito que eu introduzi e corrigi no mesmo passo

`edge()` devolve `NaN` para aresta desconhecida, e eu escrevi a guarda como `=== null`. Como
`NaN >= 0` é `false`, o filtro teria **deixado passar tudo** — em silêncio, com o ganho de desempenho
sumindo e nenhum teste acusando. Trocado por `Number.isNaN`.

## ⚠️ Dívida de processo, registrada

Esta spec e a 103 foram escritas **depois** da implementação, ao contrário do rito do repositório. E
pior: sete arquivos já citavam `Spec 103` e `Spec 105` em comentários antes de qualquer um dos dois
documentos existir — **citação para o nada**, que é pior que citação nenhuma, porque manda o leitor
procurar o que não está lá.

O gatilho foi a pressão de corrigir rápido um defeito medido em produção. O rito existe justamente
para esse momento.

## O que continua aberto

1. A API não publica `optimizationQuality` — a marca não chega à tela.
2. `maxStopsPerRoute` está `null`; falta o número operacional.
3. Decomposição por região, único caminho para milhares de paradas.
