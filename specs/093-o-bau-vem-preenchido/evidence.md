# Evidência — 093

Medições contra a base local em 2026-09-07, e as suítes que travam cada decisão.

## O que a base dizia antes

```
12 veículos · 3 com o baú medido · 10 com carga máxima · 4 com m³ digitado
```

O baú medido são os três da spec 088 (`RTA2F45`, `RTB3G56`, `RTC4H67`). O `RTD5J78` — que aparece
em cinco das doze viagens da primeira página — tem `capacity_m3 = 20` digitado e **nenhuma
dimensão**, e é por isso que a planta em escala nunca apareceu para quem monta aquelas viagens.

⚠️ **A carga máxima já estava preenchida em 10 dos 12**, e nenhuma tela a lia. `fleet_vehicles.capacity_kg`
é o `capKG` que o MDF-e exige; a coluna nova que o plano previa teria criado um segundo campo de
massa na mesma ficha. A descoberta veio de medir a base **antes** de escrever a migration.

## Cobertura da sugestão

| tipo            | veículos | tinha referência | tem agora                              |
| --------------- | -------- | ---------------- | -------------------------------------- |
| `three_quarter` | 1        | ❌               | ✅                                     |
| `toco`          | 4        | ✅               | ✅                                     |
| `truck`         | 4        | ✅               | ✅                                     |
| `vuc`           | 1        | ✅               | ✅                                     |
| `tractor_unit`  | 2        | ❌               | ❌ — e continua, o baú é do implemento |

**10 dos 12 veículos** desta frota são de um tipo que agora sugere medida; os dois de fora são
cavalos mecânicos, para os quais a ausência é o resultado certo.

O catálogo passou de sete para nove linhas:

```
motorcycle    0.570 x 0.470 x 0.570 ·     40 kg
utility       1.700 x 1.300 x 1.400 ·    650 kg
van           3.200 x 1.650 x 1.900 ·  1.200 kg
vuc           3.150 x 1.900 x 2.200 ·  1.500 kg
three_quarter 5.320 x 2.080 x 2.200 ·  4.000 kg
toco          7.000 x 2.500 x 2.400 ·  6.000 kg
truck         8.900 x 2.500 x 2.400 · 10.000 kg
implemento    14.270 x 2.460 x 2.700 · (sem carga publicada)
```

⚠️ **As dimensões das sete linhas antigas não foram tocadas**, embora a pesquisa de mercado desta
spec tenha devolvido números maiores (VUC típico 4,200 × 2,100 × 2,150 contra os 3,150 × 1,900 ×
2,200 semeados). A referência é **piso**: a dispersão dentro de um tipo chega a 2× — a van vai de
7,0 a 15,5 m³ na mesma sigla —, e subir o piso mudaria calado a ocupação de todo veículo sem ficha.

## Pesquisa de mercado

Nove tipos consultados em fontes brasileiras (Guia Log, TruckPad, bsoft, WebFrete, Gestran,
Furgofort, Mercedes-Benz, Confortini, Santana Baús, Localiza Seminovos). Três achados que entraram
em decisão:

1. **Quase nenhuma fonte publica as três medidas internas juntas.** A única com medida interna
   literal é o Guia Log, e é dela que sai a linha de `three_quarter`.
2. **`three_quarter` e `vuc` são a mesma coisa em metade das fontes** — TruckPad e bsoft chamam o
   VUC de "caminhão 3/4". Por isso a linha nova **não** é média entre as duas siglas: seria um baú
   que não existe em nenhuma delas.
3. **`car` não tem dado confiável.** O que existe é volume de porta-malas, que é outra grandeza.
   Ausência é a resposta, e ela está no contrato.

## Suítes

| suíte                                                 | resultado           |
| ----------------------------------------------------- | ------------------- |
| `bun test ./test/fleet-schema.contract.test.ts` (API) | 73 pass             |
| `bun test ./test/fleet-http.contract.test.ts` (API)   | 92 pass             |
| `bun test ./test/cargo-volume.contract.test.ts` (API) | 115 pass            |
| `bun run test` (API, 157 arquivos)                    | 4492 pass · 23 skip |
| `bun run test` (frontend, 24 arquivos)                | 2878 pass           |
| `make migration-test`                                 | 91 pass             |
| `bun run typecheck` (raiz)                            | exit 0              |

Migration aplicada e revertida em Postgres descartável pelo `make migration-test`, e aplicada na base
local por `bun run db:migrate`.

## O que ficou de fora, e por quê

- **A planta desenhada a partir da referência.** Recusada pela spec 088 D2 e reafirmada aqui pela
  medição da van (7,0 a 15,5 m³). A sugestão entra no formulário, onde um humano assina embaixo.
- **Bloquear despacho por excesso de peso.** Esta spec dá o teto; recusar viagem com base nele é
  decisão de operação com spec própria.
- **Conferência visual em 375, 768 e 1280.** Os campos novos são `hint` de campo já existente, no
  mesmo `fieldGrid` que a 088 conferiu; o painel de carga ganhou uma linha de texto no mesmo bloco
  das outras. Nenhum layout novo foi introduzido.

⚠️ **Ordem de deploy: a API sobe antes do frontend.** `TRIP_CARGO_WEIGHT_KEYS` é validado com
`hasExactKeys`, e com a API servindo o corpo antigo toda prévia de carga é recusada na validação —
o painel some com 200 na rede e nada no console. É o mesmo defeito já registrado para
`VEHICLE_DETAIL_KEYS`.
