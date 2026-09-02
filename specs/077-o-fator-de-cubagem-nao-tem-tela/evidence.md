# Evidência — 077

## Fases A e B (T001–T008, 2026-09-02)

`test/nfe-workspace/cargo-volume-panel.contract.ts` escrito primeiro, com **cinco casos falhando**.
Painel declarado em `SETTINGS_PANEL_PLACEMENT` (`nfe-workspace` / `imports`, ao lado de
`cargoWeight`), cliente com validação própria, hook, painel e rótulos.

## ⚠️ A D1 estava errada e foi revista antes de virar código

A spec dizia que sem `settings.manage` o painel ficaria **somente-leitura**, por analogia com a
busca automática de notas. A analogia não se sustenta: aquele cartão lê de **outra rota**
(`GET /nfe-imports/distribution`, permissão de operação), e o fator de cubagem tem uma fonte só,
sob `settings.manage`. Um cartão de leitura ali receberia **403**.

As saídas seriam afrouxar a permissão da rota ou criar uma segunda rota de leitura — e as duas
custam mais do que o problema pede, porque a razão original **já está atendida**: a viagem imprime
_"Valor estimado: … usa o fator de cubagem por volume configurado"_. Quem opera lê a origem do 28%
sem o painel. O contrato passou a afirmar as duas metades: o painel respeita a permissão, **e** a
viagem continua explicando de onde vem o número.

## Três contratos existentes me pararam, e os três estavam certos

1. **`mutation-pending-state.contract.ts`** — eu havia escrito `onSuccess: async () => { await
queryClient.invalidateQueries(...) }`. Aguardar o cache no callback segura o botão até a
   releitura terminar, e há varredura de fonte proibindo. Trocado por `void`.
2. **`distribution-settings.contract.ts`** — a lista de painéis da aba é afirmada **por extenso**;
   painel novo entra nela ou o contrato reprova.
3. **O meu próprio** — o texto dizia "Metros cúbicos" e a asserção procurava `metro` em minúscula.
   Reescrito para dizer a unidade no meio da frase, o que também ficou melhor de ler.

```
bun run test (frontend)   2272 pass · 0 fail
playwright (smoke)        45 passed
make check                EXIT=0
```

## Pendente

**T009** — verificação em staging: apagar o fator gravado à mão na 075, ligar pela tela, ver a
ocupação aparecer na viagem e sumir ao desligar.
