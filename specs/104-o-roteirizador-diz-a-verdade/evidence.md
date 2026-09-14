# Evidência 104 — O roteirizador diz a verdade

## A medição, antes e depois

Mesma nuvem sintética, mesma semente, **orçamento declarado de 30 s**:

| paradas | gerações |   antes |     depois | qualidade declarada |
| ------: | -------: | ------: | ---------: | ------------------- |
|      20 |       40 |   0,6 s |      0,8 s | `optimized`         |
|      50 |       44 |   8,0 s |      9,2 s | `optimized`         |
|     100 |     8–10 |  31,5 s | **30,0 s** | `partial`           |
|     200 |        0 |  56,1 s | **30,0 s** | `greedy`            |
|     305 |        0 | 123,2 s | **30,0 s** | `greedy`            |
|     345 |        0 | 183,2 s | **30,0 s** | `greedy`            |

O orçamento virou teto: **183 s → 30 s** no pior caso, sem regressão nas instâncias pequenas, que
continuam parando por estagnação.

⚠️ **A qualidade não melhorou, e não era esse o objetivo.** 200 paradas continuam produzindo zero
gerações — o que muda é que o resultado agora **se declara** `greedy` em vez de posar de otimizado.
Melhorar a qualidade acima de 120 paradas é o item 4 (volume) e o item 5 (trocar o solver) da
revisão, e nenhum dos dois está nesta spec.

## Gates

```
make check                        exit 0
worker  bun run test              951 pass / 0 fail
worker  typecheck · eslint        limpos
```

## Contratos escritos antes da implementação

| arquivo                                    | o que tranca                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `test/routing-honesty/budget.contract.ts`  | o orçamento é teto; 2-opt interrompido devolve rota completa; instância pequena não regride |
| `test/routing-honesty/quality.contract.ts` | zero geração é `greedy`; estagnação é `optimized`; cortado depois de evoluir é `partial`    |
| `test/routing-honesty/balance.contract.ts` | violação de teto com o número; `null` desliga; teto folgado não restringe                   |

⚠️ O contrato de orçamento **travou a suíte** antes da implementação — 306 paradas com 3 s de
orçamento não terminavam. Foi a melhor prova possível do defeito, e não estava planejada.

## Decisões que ficaram no código

- **A conferência do relógio é no laço externo dos candidatos do 2-opt**, não no interno: consultar
  o relógio a cada par pagaria o custo O(n²) vezes por passada.
- **`maxStopsPerRoute` nasce `null` e nenhuma origem o preenche.** Um padrão silencioso mudaria o
  roteiro de toda instalação sem ninguém pedir, e um número escolhido aqui seria palpite com cara de
  regra. A infraestrutura está pronta; declarar o valor é decisão de produto.
- **Teto absoluto, nunca fatia igualitária:** a fatia obrigaria a usar a frota inteira — 20 notas com
  6 caminhões dariam teto 4, espalhando carga que cabia num veículo só.
- **A instância trivial sai `optimized`**, não `greedy`: sem parada não há o que otimizar, e chamar
  de gulosa uma resposta exata seria o erro simétrico.

## O que continua aberto

1. Acima de ~120 paradas o resultado é a semente gulosa. A tela precisa **imprimir**
   `optimizationQuality` — a API ainda não a publica, e sem isso a marca não chega a quem decide.
2. Volume como segunda dimensão (item 4), que exige emendar a ADR-0044 §9.
3. Trocar o solver (item 5) — VROOM é o candidato.
