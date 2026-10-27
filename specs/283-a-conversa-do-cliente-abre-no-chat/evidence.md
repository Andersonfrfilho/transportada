# Evidência 283

## T4 — painel (coluna, faixa e aba do Cliente)

Prints dos componentes reais (`ClientConversationPanel`, `ClientConversationStrip`, `ConversationColumn`, CSS e textos do
produto) montados num harness descartável, com o formato de resposta do contrato T1 (`contract.md`). Não passam pela API.

- `prints/t4-coluna-desktop-1400-dark.png` — ≥ 80 rem: terceira coluna à direita.
- `prints/t4-faixa-1100-dark.png` — 64–80 rem: faixa recolhida abaixo das duas colunas, canais à vista.
- `prints/t4-aba-celular-375-light.png` — modo abas e celular: aba "Cliente" com contador.

Gates: `tsc --noEmit`, `bun run test` do frontend (8613 + 1424 passam), eslint e prettier nos arquivos tocados.

A largura da terceira coluna é 80 rem (e não 90, como a primeira versão da spec): o contrato de responsividade só admite
os pontos 40, 64 e 80 rem.
