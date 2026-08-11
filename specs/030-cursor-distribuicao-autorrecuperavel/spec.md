# 030 — Cursor de distribuição autorrecuperável

## Problema

Em 10–11/08/2026 a busca automática de NF-e ficou o dia inteiro parada com o cursor congelado em
`000000000037701` contra um `max_nsu` de `000000000045636`. Cada ciclo do cron voltava `cStat 656` e
a tela mostrava “importação concluída, 0 notas”.

A NT 2014.002 §3.11.4.1 explica o mecanismo, e ele não é o intervalo de uma hora: a segunda causa de
consumo indevido é **consultar fora de sequência**. _“O usuário deve sempre realizar a consulta
baseada no ultNsu retornado na consulta anterior... Se consultar fora da sequência, será
bloqueado.”_ Como o nosso cursor só avançava quando a página inteira persistia, uma falha de
persistência deixava o cursor atrás da marca d'água que a SEFAZ já havia servido — e a partir dali
**toda** consulta era uma violação nova, com bloqueio renovado de uma hora. A NT ainda avisa que
_“se retomar a consulta antes de completar 1 hora, o tempo é zerado”_, então o cron horário
alimentava o próprio bloqueio indefinidamente.

O desbloqueio de 11/08 foi manual, por `UPDATE` direto no Postgres de produção. Isso não pode ser o
procedimento: exige SSH, conhecimento do laço e uma janela de tempo entre ticks do cron.

## Objetivo

1. O worker **não fica para trás** — o cursor acompanha o `ultNSU` que a SEFAZ devolveu, mesmo quando
   a página falha ao persistir.
2. Quando ainda assim ficar, ele **se recupera sozinho**, sem intervenção.
3. Quando a recuperação automática custar documentos, isso fica **visível**, nunca silencioso.
4. Existe um ajuste manual do cursor na página de Configurações, para o caso que a automação não
   cobrir.

## Fora de escopo

- Reaver os ~7.900 documentos represados entre `37701` e `45636`: decisão do usuário em 11/08 é
  abandoná-los (“as notas anteriores a essas últimas que importamos não tem problema de não
  trazê-las, mas daqui para frente precisamos das notas”).
- Conserto de lacuna documento a documento por `consNSU` (§3.6). Fica registrado como dívida: a
  lacuna passa a ser **gravada**, e o reparo automático vem depois, respeitando o teto de 20
  consultas por hora do §3.11.4.2.
- Expor o `ultNSU` que a SEFAZ devolve dentro da rejeição 656 (NT 1.14). Depende de mudança no
  `@adatechnology/fiscal-provider`, que hoje lança `Error` cru e descarta o campo. Continua sendo o
  conserto mais direto e fica como próximo passo, mas esta feature não depende dele.

## Comportamento

### Avanço do cursor (regra 1)

O cursor grava o `ultNSU` devolvido pela SEFAZ **assim que a página chega**, antes do resultado da
persistência. Se a persistência falhar, o intervalo de NSU daquela página é registrado como pulado e
o ciclo segue. Perder um documento é recuperável por `consNSU`; ficar fora de sequência bloqueia o
CNPJ inteiro.

### Ressincronização automática (regra 2)

`cStat 656` incrementa um contador no cursor. Ao chegar em **2 recusas seguidas com
`ult_nsu < max_nsu`**, o worker avança o cursor para `max_nsu`, grava o intervalo abandonado e abre
janela de uma hora. Qualquer resposta 137 ou 138 zera o contador.

O teste `ult_nsu < max_nsu` é o que separa as duas causas do §3.11.4.1 sem adivinhação: a causa 1
(nada novo, espere uma hora) só acontece depois de um `cStat 137`, e ali `ultNSU == maxNSU` por
construção. Cursor atrás do máximo com 656 repetido é, necessariamente, a causa 2.

Duas recusas e não uma: a primeira pode ser colisão comum com a janela de uma hora, e
ressincronizar nela abandonaria documentos à toa.

### Janela obrigatória em todo salto de cursor (regra 3)

**Salto** é escrita de `ult_nsu` que não veio do `ultNSU` de uma página: a ressincronização
automática e o ajuste manual. Todo salto abre janela de uma hora. Sem isso, um ajuste feito 5
minutos antes do tick do cron dispara consulta dentro do bloqueio corrente da SEFAZ e zera a
contagem dela, que é exatamente o modo de falha que a NT descreve.

O avanço sequencial — o `ultNSU` que a página devolveu — **não** abre janela: consultar em sequência
é o uso correto do serviço, e travá-lo por uma hora limitaria o dreno a 50 documentos por hora.

A regra vive no tipo, não na disciplina de quem chama: salto tem método próprio no repositório
(`resyncCursor` no worker, o use case de ajuste na API), e esse método calcula a janela sozinho —
não existe caminho de código que salte sem ela.

### Visibilidade da perda (regra 4)

O intervalo pulado — origem, fim e momento — fica no cursor e aparece no painel de Configurações. Um
salto de NSU sem rastro é indistinguível de nota que nunca existiu.

### Ajuste manual

Em Configurações, um painel mostra `ult_nsu`, `max_nsu`, próxima janela permitida, recusas seguidas e
o último intervalo pulado. Com `settings.manage` é possível gravar um novo `ult_nsu`.

Validação: 15 dígitos e `ultNsu <= maxNsu` — NSU acima do máximo do Ambiente Nacional devolve
rejeição 589, e não faz sentido deixar o operador cair nela.

## Critérios de aceite

- Página que chega e falha ao persistir **ainda assim** avança o cursor, e o intervalo aparece como
  pulado.
- Dois 656 seguidos com `ult_nsu < max_nsu` movem o cursor para `max_nsu` sem intervenção.
- 656 com `ult_nsu == max_nsu` **não** move nada: é a espera legítima da causa 1.
- Resposta 137 ou 138 zera o contador de recusas.
- Todo salto de cursor — ressincronização ou ajuste manual — deixa `next_allowed_at` uma hora à
  frente, e o avanço sequencial de página não mexe na janela.
- `PUT` com `ultNsu` acima de `max_nsu` responde 422 sem gravar.
- `PUT` sem `settings.manage` responde 403.
- Cursor de outra empresa é invisível e ingravável pela rota (contrato de isolamento).
