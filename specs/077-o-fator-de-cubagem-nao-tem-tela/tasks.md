# Tasks — 077 O fator de cubagem não tem tela

Uma task por vez. Contrato **antes** da implementação, falhando primeiro. Evidência em
`evidence.md`.

---

## Fase A — O caminho até o dado

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato de aba: o painel de cubagem existe em `SETTINGS_PANEL_PLACEMENT`, em
      `nfe-workspace` / `imports`, **ao lado de `cargoWeight`**, e a consulta liga com
      `settingsScope`. Falha antes de existir. (RF1 · CA1)
- [x] **T002** — Declarar o painel no registro e no tipo `SettingsPanel`.
- [x] **T003** — Cliente HTTP do módulo para as três rotas
      (`GET`/`PUT`/`DELETE /company-settings/cargo-volume-factors`), com validação de resposta no
      padrão de `*.validation.ts` — nada de `any`.

---

## Fase B — O painel

> 🤖 Modelo: `sonnet`

- [x] **T004** — Contrato do painel: abre **preenchido** com o fator atual; zero é recusado com
      mensagem no campo; desligar chama `DELETE`; sem `settings.manage` fica somente-leitura e
      **não some**. (P2, P3, D1 · CA2, CA3, CA4)
- [x] **T005** — Implementar o painel, com o campo pelos tokens e o texto de ajuda dizendo **o que
      o número significa** (m³ por volume) e **o que ele afeta** (a ocupação na viagem). (RF4 · CA5)
- [x] **T006** — Formato brasileiro na entrada e na saída, para falar a mesma língua da viagem, que
      já imprime `2,25 m³`. (RF2)
- [x] **T007** — A espécie aparece como **padrão** quando há uma linha só, e vira lista quando
      houver mais — sem obrigar o operador a entender hoje uma dimensão que ele não usa. (P4 · RF5)

---

## Fase C — Fecho

> 🤖 Modelo: `haiku`

- [x] **T008** — `make check` verde, contrato de acentos verde, evidência completa.
- [x] **T009** — Verificar em staging: ligar a estimativa pela tela numa empresa sem fator, ver a
      ocupação aparecer na viagem, e desligar vendo-a sumir.
      ⚠️ O fator de staging foi gravado **direto no banco** na verificação da 075 — apagá-lo antes
      é parte do teste, senão a tela abre preenchida e a P1 não é exercitada.
