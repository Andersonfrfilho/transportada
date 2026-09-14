# Feature 104 — O roteirizador diz a verdade

> Registrada em 2026-09-09, a partir das medições de `docs/routing/algorithm-review.md`.
> Escopo: os itens 1 a 3 da recomendação. Volume (item 4) e troca de solver (item 5) ficam fora.

## Problema

Uma montagem com 305 paradas propôs **6.655 km e 150 horas** de direção, repartidas em 7 viagens —
uma com 207 notas, outra vazia. O benchmark explica os três motivos, e nenhum deles é bug de código:

| paradas | gerações | orçamento declarado |     gasto |
| ------: | -------: | ------------------: | --------: |
|      50 |       44 |                30 s |       8 s |
|     100 |       10 |                30 s |      31 s |
|     200 |        1 |                30 s |      56 s |
|     305 |    **0** |                30 s | **123 s** |

1. **Acima de ~200 paradas o GA não roda.** Zero gerações é a semente gulosa com 2-opt parcial,
   apresentada como sugestão otimizada.
2. **O orçamento é piso, não teto.** O `deadline` só é conferido entre gerações, e uma geração
   grande leva minutos. Quem pede 30 s espera 3 minutos e conclui que travou.
3. **O objetivo não sabe o que é equilíbrio.** O fitness é a **soma** dos custos, e concentrar
   paradas próximas num veículo **reduz** a soma. 207 × 8 é o ótimo do que pedimos.

## D1 — O orçamento vira teto, conferido onde o tempo é gasto

`improveWithTwoOpt` recebe um predicado de parada e o consulta **entre passadas e dentro do laço de
candidatos**. Interrompido, devolve a melhor rota que já tinha — nunca uma rota pela metade.

⚠️ Conferir só entre gerações é o que produz o estouro: o custo está **dentro** de uma geração.

## D2 — A honestidade é um campo, não um teto que recusa

O solver passa a declarar `optimizationQuality`:

| valor       | quando                                         | o que a tela diz                   |
| ----------- | ---------------------------------------------- | ---------------------------------- |
| `optimized` | parou por estagnação                           | sugestão otimizada                 |
| `partial`   | cortado pelo relógio, mas evoluiu (≥1 geração) | otimização incompleta              |
| `greedy`    | **zero gerações**                              | roteiro aproximado, sem otimização |

⚠️ **Não recusamos o lote grande.** O operador com 305 notas tem um problema real, e negar serviço o
manda para a planilha. O que não podemos é chamar de otimizado o que não foi — a marca é obrigatória
ao lado do resultado, na mesma regra da ocupação estimada (spec 075) e da origem do peso (ADR-0044 §5).

`MAX_OPTIMIZABLE_STOPS = 120` é constante **medida**, não escolhida: é onde o GA ainda completa
gerações no orçamento padrão. Ela existe para a API avisar **antes** de o operador esperar.

## D3 — O objetivo ganha um teto de paradas por rota

Penalidade por parada acima de `maxStopsPerRoute`, no mesmo idioma das outras (micros no fitness,
violação explícita com o número).

⚠️ **Teto absoluto, nunca fatia igualitária.** A fatia (`total ÷ veículos`) obrigaria a usar toda a
frota: 20 notas com 6 caminhões dariam teto 4, e o solver espalharia carga que cabia em um veículo
só — trocando um desperdício por outro. O teto é operacional: quantas entregas cabem num dia de
trabalho.

⚠️ **Não substitui a jornada.** `maxDutySeconds` é a restrição correta e continua valendo; o teto de
paradas é a rede para quando ela é `null`, que é o caso hoje na maior parte das instalações.

⚠️ `null` desliga, como toda restrição deste solver.

## Fora de escopo

- Volume como segunda dimensão (item 4) — exige emendar a ADR-0044 §9.
- Trocar o solver por VROOM/PyVRP (item 5) — decisão de produto.
- Operador de troca entre rotas (_relocate_/_swap_), que é o que o HGS tem e nós não.

## Aceite

1. Orçamento de 30 s termina em ~30 s, com 305 paradas — contrato que mede.
2. Interromper o 2-opt devolve rota válida, nunca pela metade.
3. `optimizationQuality` sai `greedy` quando não houve geração, e a tela imprime a marca.
4. Rota acima do teto de paradas produz violação explícita com o número.
5. Teto `null` não restringe nada.
6. Nenhuma regressão nas instâncias pequenas: 20 e 50 paradas continuam convergindo.
