# 044 — A nota bloqueada tem nome

## Problema

A 043 fez a prévia barrar a nota sem endereço de tomador. Barrar é certo; o que a tela faz com o
bloqueio é que não serve.

Com 16 notas selecionadas e **uma** sem endereço, o operador vê:

```
Notas fora da emissão
  Endereço do tomador incompleto — 1 nota
```

Clica em emitir, e a API recusa a emissão **inteira** com `NFSE_DOCUMENT_MISSING_TAKER_ADDRESS`. A
tela traduz para "Uma das notas não traz o endereço completo do tomador". Ele agora sabe que existe
uma nota ruim entre dezesseis, e **não tem nenhuma forma de descobrir qual**. Ou desmarca por
tentativa e erro, dezesseis vezes, ou desiste.

Quatro coisas concorrem para isso, e nenhuma é a frase:

1. **A criação é tudo ou nada.** `assertNoNfseBlocks` pega o primeiro bloqueio e lança; o
   `nfse-invoice.use-case.ts` a chama antes de criar qualquer coisa. Um bloqueio recusa a emissão
   toda — e isso está **certo**, porque emitir 15 de 16 sem o operador ter pedido seria pior.
2. **O bloqueio não sabe o nome da nota.** `NfseSelectionBlock` é `{documentId, reason}`, e
   `documentId` é UUID. O operador lê "NF-e 873492/2".
3. **A tela conta em vez de nomear.** `emission.blockedCount` renderiza `{{count}} notas` a partir
   de `group.documentIds.length` — os ids estão ali, no grupo, e só o tamanho é usado.
4. **O botão de emitir fica habilitado com bloqueio na mesa.** `isEmissionEnabled` só verifica se há
   linha na prévia. O operador clica sabendo menos do que a API já sabe, e paga com um 422.

## Objetivo

O operador olha a prévia, lê **quais** notas estão fora e por quê, remove essas notas da seleção, e
emite. Sem clicar em nada que já se sabe que vai falhar.

## Decisões

**O nome da nota nasce no domínio, não na tela.** `NfseSelectionBlock` ganha `number` e `series` —
`null` quando o bloqueio é anterior a existir documento (`notFound`) e o rótulo não existe para ser
dito. Deixar a tela montar o rótulo a partir de outra consulta seria duas fontes para o mesmo dado.

**Tudo ou nada continua.** A criação não passa a emitir o subconjunto bom: fatura parcial que o
operador não aprovou é pior que recusa clara. O que muda é ele saber o que remover **antes** de
clicar.

**O botão desabilita com bloqueio na mesa.** Com a lista nomeada logo acima, desabilitar deixa de
ser parede e passa a ser a próxima instrução. O 422 de `assertNoNfseBlocks` continua no lugar como
última linha — ele passa a cobrir o que sempre deveria ter coberto: a corrida entre a prévia e a
criação, quando o estado muda no meio.

**A lista nomeada tem teto.** A seleção vai a 500 documentos; despejar 500 rótulos numa seção de
diálogo é a mesma inutilidade da contagem, do outro lado. Mostra-se até
`NFSE_BLOCK_LABEL_LIMIT` (10) rótulos por razão, e o excedente vira "e mais N" — a contagem
sobrevive onde ela realmente informa.

**A razão traduzida é obrigação de contrato, não cortesia do `defaultValue`.** A tela renderiza
`t('emission.blockReason.${reason}', { defaultValue: group.reason })`. Hoje todos os verbetes existem
— a 043 acrescentou o dela —, mas o `defaultValue` garante que a **próxima** razão nova apareça como
`NFSE_DOCUMENT_ALGUMA_COISA` na cara do operador, sem nada falhar. O contrato de locales atual só
varre `feedback.*`, então não pega. A 044 fecha isso varrendo o vocabulário de bloqueio inteiro.

**O erro de criação não ganha contexto tipado.** `ApiErrorDetail` é `{field, message}`, desenhado
para erro de validação de Zod: `field` não é documento, e `message` traria texto da API para uma
tela que traduz por código. A prévia é a superfície que nomeia; o erro de criação continua sendo um
código.

## Fora de escopo

- Emitir o subconjunto elegível. É decisão de produto, não de mensagem, e muda o que a empresa
  aprova ao clicar.
- Desmarcar a nota bloqueada pelo próprio diálogo. Tentador, mas a seleção é da tabela; um segundo
  lugar que mexe nela é onde os dois passam a discordar.
- Corrigir endereço pela tela. Continua sendo dado da NF-e (fora de escopo desde a 043).

## Critérios de aceite

1. `selectNfseCandidates` devolve `number` e `series` em todo bloqueio de documento que existe, e
   `null` nos dois campos quando o documento não foi encontrado.
2. A resposta da prévia carrega `number` e `series` em cada item de `blocked`.
3. `groupNfseBlocksByReason` agrupa carregando os rótulos, e devolve o excedente além do teto como
   contagem separada.
4. A seção "Notas fora da emissão" nomeia as notas (`NF-e <número>/<série>`) **junto da razão
   traduzida**, com "e mais N" acima do teto.
5. Toda razão de bloqueio que a NFS-e pode devolver tem verbete em `emission.blockReason.*` nos dois
   idiomas — contrato, não `defaultValue`.
6. O botão de emitir fica desabilitado enquanto houver bloqueio, e a razão fica visível.
7. O 422 de `assertNoNfseBlocks` continua existindo, com o mesmo código, para a corrida
   prévia→criação.
8. `make check` completo verde.

## Riscos

**O teto esconde.** Acima de 10 rótulos por razão o operador volta a depender de contagem. É
aceito: quem selecionou 500 notas com 40 sem endereço tem problema de cadastro, não de mensagem, e o
caminho ali é a origem.

**Desabilitar o botão pode ler como travamento** se a lista de bloqueios não estiver visível na
mesma tela. É por isso que o critério 5 exige as duas coisas juntas — desabilitar sem dizer o motivo
seria trocar um 422 explicado por um botão morto e mudo.
