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

---

## T009 — Verificação em staging (2026-09-02)

Apaguei o fator que a 075 gravara à mão, deixando a base **no estado de uma instalação nova** — sem
isso o painel abriria preenchido e a P1 não seria exercitada.

O ciclo inteiro, pela tela:

1. **Painel vazio** na aba Importações, ao lado do peso padrão, com o texto explicando o efeito:
   _"O volume que cada volume da nota ocupa, em metros cúbicos. A NF-e não traz medida da carga,
   então este número é o que estima a ocupação do veículo exibida na viagem."_
2. **Gravei `0,05`** pelo campo, em formato brasileiro. O botão de desligar apareceu — ele só existe
   com fator gravado.
3. **A viagem passou a mostrar `28% do baú · 2,25 m³ de 8,00 m³`**, com a marca de estimativa.
4. **Reabri a aba**: o painel voltou **preenchido com `0,05`** (P2).
5. **Desliguei**: campo esvaziou, botão sumiu, e a linha saiu do banco (`DELETE`, não zero).

### ⚠️ O comportamento sem fator é melhor do que a spec previa

A P3 dizia "a ocupação desaparece das viagens". Não desaparece — e o que acontece é melhor:

```
Ocupação do veículo · 0% do baú · 0,00 m³ de 8,00 m³
3 notas sem cubagem não entraram na conta.
```

A capacidade continua conhecida (8 m³ do veículo), então **a ausência é da carga, não do
denominador** — e a RF7 cobre exatamente isso: nota sem cubagem é contada à parte em vez de somar
como zero. Sumir o painel esconderia que há três notas sem medida.

### ⚠️ E um defeito meu, achado clicando

O painel do peso já usava **"Desligar estimativa"**, e o meu nasceu com o **rótulo idêntico** na
mesma aba: dois botões com o mesmo texto, lado a lado, desligando coisas diferentes — e o do peso
**desabilitado**, por não haver peso configurado.

Não é detalhe de redação. Eu cliquei no errado ao verificar e levei três passos para perceber que a
linha não sumia do banco porque eu estava acionando um botão desabilitado de outro painel. O
operador chegaria à conclusão de que o recurso não funciona.

Corrigido para **"Desligar cubagem estimada"**, com contrato afirmando que os dois rótulos diferem.

---

## Conserto de 2026-09-02 — o campo mentia sobre o que tinha salvo

Achado ao trocar o fator de `0,05` para `0,035` em staging. A base guardou `0.035000`, e o campo
mostrou **`0,04`** — inclusive depois de recarregar a página. A coluna é `numeric(12,6)`: o corte
era do `Intl.NumberFormat` de duas casas dentro do painel, aplicado ao valor **já salvo**.

O estrago não é cosmético. Quem digita `0,035`, lê `0,04` e conclui que o sistema recusou o valor —
e a correção instintiva é digitar `0,04` de novo, que aí grava mesmo. A tela ensinava o operador a
estragar o dado que ele tinha acabado de acertar.

`shared/cargoVolumeField.service.ts` passou a ser o único lugar que converte, nos dois sentidos:

- **A exibição nunca arredonda** — corta zero à direita do decimal guardado, e só. Formatar por
  casas máximas é o que produz a mentira, em qualquer casa que se escolha. A garantia que fecha
  isso é ida e volta: `parse(format(x)) === x`.
- **O que a tela mostra, ela aceita.** Três casas nos dois lados; aceitar mais casas do que se sabe
  mostrar devolveria o mesmo defeito uma casa adiante.
- **Sem float binário.** A conversão passou a ser textual — `parseFloat` + `toFixed` era o caminho
  antigo, e decimal por ponto flutuante é proibido no repositório desde o começo.

Verificado em staging depois do deploy: o campo abre em `0,035`; `0,0355` é recusado com
`aria-invalid`, botão bloqueado e o motivo escrito ("com até três casas decimais"); salvar `0,035`
devolve `0,035` na tela e `0.035000` na base.

⚠️ **A API continua aceitando seis casas** — o limite de três é da tela. Um fator de quarta casa
gravado por fora aparece por inteiro e o campo o recusa até ser corrigido, que é o comportamento
honesto para um valor que esta tela não sabe representar.
