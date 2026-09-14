# Spec 135 — Apoio de 80% da base, escora só pelo lado, e a pegada fora do padrão no espaço morto

> 🤖 Modelo: `opus` 🧠 (regra física do apoio e da escora, e a causa do sintético) · `sonnet` (tempo,
> contratos, docs)

## Problema

1. **O juiz se escorava no degrau** (decisão do usuário): a caixa mais larga embaixo de uma pilha passa
   da face dela e chega à altura da contenção, e contava como vizinha. Na linha `ce0a2d08`, com o juiz
   corrigido, 10, 58, 99 e 26 caixas das quatro viagens reais ficam sem apoio.
2. **Nivelado é mais que a física pede.** Exigir o piso plano sob a pegada inteira recusava a caixa de
   0,371 m sobre duas de 0,261 m desalinhadas 3 cm, e com a escora corrigida o Atego caía de 1335 para
   1016 caixas (medido em `19c34f9e`).
3. **As bordas reais (coordenada exata) fragmentam a carga de pegada misturada.** A grade de 5 cm
   arredondava a presumida de 0,371 × 0,261 e a medida de 0,40 × 0,30 para a mesma célula de
   0,40 × 0,30; com a medida exata, a caixa fora do padrão abre fileira fora de fase, sobra vão onde
   nenhuma presumida cabe, e as pilhas vizinhas perdem a contenção. Atego sintético de 85 paradas
   (`dead-space.contract.ts`): **26 fora em `ce0a2d08`, 195 com as bordas reais, 236 com os 80%**, contra
   o teto de 216.

## Decisões

- **D1 — Escora é encosto pelo lado com altura sobreposta.** A caixa embaixo dela no plano sustenta e
  nunca escora; o trecho encostado conta a partir de `MIN_BRACE_CONTACT_M` (1 cm) e a vizinha precisa
  subir ao lado dela pelo menos `MIN_BRACE_HEIGHT_M` (1 cm, só no juiz). Vale no empacotador
  (`isConfined`) e no juiz da descarga (`unloading-simulation.ts`).
- **D2 — Apoio mínimo de 80% da base** (`MIN_SUPPORTED_BASE_FRACTION`), contado de forma exata sobre as
  bordas reais (`isBaseSupported`, `cargo-edge-grid.ts`). Nada sob a pegada passa do assento.
- **D3 — A pegada fora do padrão da carga vai ao espaço morto.** Pegada diferente da forma dominante,
  e não maior que ela em células, é tratada como "pequena" (117/130): entra depois das grandes da
  própria entrega e procura primeiro o espaço morto, depois o assento ao alcance mais alto. E ela
  **só balança sobre carga** (`onlyOverLoad`): fora do piso, nenhuma parte da pegada fica sobre o piso
  nu — a prateleira dela escondia o vão embaixo, que o relevo conta como cheio.
- **D4 — Tempo sem mudar resultado.** Recusa antecipada de assento longe da mão (`rejectEarly`), memória
  dos começos de coluna até a próxima borda nova, carga agrupada por entrega no complemento, e
  `isConfined` sem montar funções por chamada. Assinatura das 99 cargas idêntica antes e depois.

## Fora de escopo

- Carga por eixo (`axleNotChecked` continua).
- Subir o teto de 50 ms ou o de 216 caixas do sintético (decisão do usuário).
