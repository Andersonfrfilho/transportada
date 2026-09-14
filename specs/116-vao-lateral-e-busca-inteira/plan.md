# Spec 116 — Plano

> 🤖 Modelo: `opus`

## Onde

`apps/api-transportada/src/trips/domain/cargo-placement.policy.ts`:

- `packSlice` — `seatAttempts = max(MAX_SEAT_ATTEMPTS, SEAT_ATTEMPTS_PER_ROW × fileiras de célula da
fatia)` substitui o teto fixo de 64 no laço e na memória de formato.
- `createSupportMap().isConfined` — `bracedToward` anda do lado da caixa para fora, atravessando
  células vazias enquanto a distância da face **real** da caixa até a borda da célula for menor que
  `braceGapOf(slot)`; a parede fechada do outro lado apoia, a face aberta não.
- `braceGapOf(slot)` = `3b/√10`, com `b` a menor base e 3 a `STABLE_STACK_SLENDERNESS` — nenhum número
  novo.

## Contratos (antes do código)

- `test/cargo-placement/side-gap-brace.contract.ts` (novo, importado pelo entrypoint
  `cargo-volume.contract.test.ts`): com 7 cm até a parede a coluna da borda passa de 3 × base; com 29
  cm (maior que o giro de 28,5 cm) continua abaixo.
- `test/cargo-placement/real-mixed-cargo.contract.ts`: o Atego desenha ≥ 1250 caixas, ≤ 8 paradas
  fora, todas entre as dez primeiras entregas.

Os dois reprovam o código de `6af8669d` e passam depois.
