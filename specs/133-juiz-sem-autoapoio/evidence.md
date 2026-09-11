# Spec 133 — Evidência

## O defeito, medido

Juiz antigo (`85cbb5fc`, `unloading-simulation.ts:82` e `:177`): o carimbo cobre as células cujo
**centro** cai dentro da caixa, e a primeira sonda fica a 0,5 mm da face. Face em x = 0,474: a sonda em
0,4735 cai na célula 47 (centro 0,475), carimbada pela própria caixa (`ceil(47,4 − 0,5) = 47`). A
fileira do fundo do Accelo passava escorada nela mesma.

Contrato novo no juiz antigo: `a fileira do fundo, longe da testeira, não se escora nela mesma` —
esperado 6, recebido **0**; `a caixa alta e fina, sozinha no piso, não se escora no vazio` — esperado 1,
recebido **0**. No juiz corrigido os dois passam.

## Juiz antigo × corrigido, nas quatro viagens e nos cubos

Empacotador de `85cbb5fc`, sem mudança nenhuma:

| carga             | caixas | antigo | corrigido | recomendado só (corrigido) |
| ----------------- | -----: | -----: | --------: | -------------------------: |
| RTC-4H67 Daily    |    481 |      0 |         0 |                          0 |
| RTE-6K89 Sprinter |    252 |      0 |    **15** |                         15 |
| RTD-5J78 Accelo   |    500 |      0 |    **15** |                         15 |
| RTA-2F45 Atego    |   1335 |      0 |         0 |                          0 |
| cubo a cada 3     |   1180 |      0 |         0 |                          — |
| cubo a cada 5     |   1216 |      0 |         0 |                          — |
| cubo a cada 10    |   1214 |      0 |         0 |                          — |

As 30 são **todas** a face da testeira (`x-`) da fileira do fundo, recomendadas, acima de três bases:

- Sprinter: a carga começa a 0,315 m da testeira (giro 0,248 m) — 5 caixas da entrega 22 a 0,63 m, 5 da
  21 a 0,63–0,84 m, 5 da 20 a 0,84–1,05 m.
- Accelo: a carga começa a 0,474 m — 5 da 23, 7 da 22, 3 da 21, entre 0,63 e 1,26 m.

Nas 32 variações (fração 1 · 0,75 · 0,5 · 0,3 × teto de massa real · 0,3) o corrigido acusa **24 de
32** cargas, de 6 a 36 caixas. O antigo acusava 14 delas, com o mesmo número do corrigido em todas; nas
outras **10** ele dizia zero (Daily 21 e 14; Sprinter 15, 15, 14 e 12; Accelo 15, 15, 6 e 13) — a
mesma carga com outro deslocamento: a sonda cai ou não na própria célula conforme o milímetro da face. O juiz corrigido no worktree e o protótipo do scratchpad dão o mesmo número nas 35
cargas.

O vazio escorando (R3) **não muda número nenhum** hoje: nenhuma carga medida tem caixa alta e fina
sozinha no piso. Ele entra porque a regra estava errada, e o contrato sintético o prova.

## Conferência exata × juiz corrigido — Atego 84 × 0, e as outras

| carga    | exata | corrigido | só na exata | pela exigência de uma caixa atravessar a contenção | por ignorar vizinha que começa antes da face | resto |
| -------- | ----: | --------: | ----------: | -------------------------------------------------: | -------------------------------------------: | ----: |
| Daily    |    26 |         0 |          26 |                                                 16 |                                           10 |     0 |
| Sprinter |    87 |        15 |          72 |                                                 14 |                                           58 |     0 |
| Accelo   |   156 |        15 |         141 |                                                 42 |                                           99 |     0 |
| Atego    |    84 |         0 |          84 |                                                 58 |                                           26 |     0 |

Nenhuma caixa é acusada só pelo juiz corrigido. Relaxadas as duas exigências da exata, ela devolve
**exatamente** o conjunto do juiz corrigido (15, 15, 0, 0). As duas exigências são defeitos da exata:

1. **"Uma caixa só tem de atravessar a altura da contenção"** (`o.zM <= r`). A vizinha na mesma camada,
   sentada na própria pilha, não conta, e a pilha dela também não, porque nenhuma caixa daquela pilha
   atravessa a altura exata. Caso medido, Daily: a caixa da entrega 12 em y 0,950–1,211, z 1,26–1,47
   (contenção a 0,687 m) tem a vizinha a 3,9 cm, na mesma camada, sobre uma coluna cheia até o piso. Ela
   está escorada. **O corrigido está certo.**
2. **"A vizinha tem de começar depois da face"** (`o.yM >= face`). Quando a camada de baixo está
   deslocada 5 cm, a caixa de baixo começa antes da face (encostada embaixo da pilha da caixa conferida)
   e ocupa o lado de fora até a contenção. É apoio. **O corrigido está certo.** Nos cubos (214, 167, 129
   na exata contra 0) são os dois mesmos motivos: o cubo de 10 cm no topo da pilha tem a coluna vizinha
   inteira ao lado.

A exata tem uma coisa certa que o antigo não tinha — não se escora nela mesma — e isso o corrigido
herdou. A exata não vira contrato.

## Contratos que passavam por sorte

Com o juiz corrigido e a asserção antiga (`[]`), ficariam vermelhos:

- `unloading.contract.ts` — Sprinter (15) e Accelo (15): `nenhuma caixa perde apoio`.
- `complement.contract.ts` — Sprinter e Accelo, `o mapa recomendado sozinho cumpre a spec 118` (15, 15)
  e `ninguém perde apoio na descarga` (15, 15).
- `dead-space.contract.ts` (cubos a cada 3, 5 e 10): **seguem verdes** — 0 no corrigido.

As seis asserções passam a cobrar `≤ knownUnsupportedOf(placa)` — 0 · 15 · 0 · 15 — até a spec 134.

## Gates

- `bun test ./test/cargo-volume.contract.test.ts` — 272 pass, 0 fail.
- `bun run typecheck` — limpo.
- `make check` — ver o commit.
