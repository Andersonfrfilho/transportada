# ADR 0046 — A viagem não fala com a SEFAZ, mas passa a saber quando pedir

- Status: aceito
- Data: 2026-08-26
- Decisores: mantenedor do projeto e revisão Opus
- Fecha a decisão da spec 059
- **Revisa a ADR-0023** — a distinção está no §0 abaixo, e ela existe para a próxima pessoa não ler o
  0023 e concluir que esta feature o viola
- Depende da **ADR-0043** (a nota anda pela viagem: `dispatched` é o gatilho e a garantia)

## §0 — O que muda no ADR-0023, e o que continua igual

O ADR-0023 decidiu que a viagem é entidade própria e **não fala com a SEFAZ**. Isso continua
literalmente verdadeiro: quem fala com a SEFAZ é a trilha de emissão — outbox, fila, provedor fiscal
(ADR-0016) —, e nada nesta decisão põe uma chamada de SEFAZ dentro do domínio de viagem.

O que muda é mais estreito: a viagem passa a **saber quando está pronta** e a **poder pedir**. Saber
é leitura do estado fiscal que já existe; pedir é chamar o mesmo caso de uso de emissão que o botão
da tela chama hoje. Nenhum estado fiscal é espelhado em `trips` como fonte — e o §2 abaixo é a razão.

## Contexto

A emissão de MDF-e funciona. O que não existe é a regra que decide **quando** a viagem está pronta
para manifestar, e o custo disso é caro do jeito específico que só o fiscal é: o manifesto declara à
SEFAZ quais CT-e vão naquele veículo. Manifestar cedo é declarar documento que ainda não existe;
manifestar tarde é caminhão na estrada sem MDF-e — multa e retenção em barreira.

Hoje quem decide é uma pessoa olhando duas telas. O `TripMdfePendingDialog` que existe no frontend é
a **evidência do problema**, não a solução: ele descobre o bloqueio no instante do clique, quando o
caminhão já está com o motor ligado.

## Decisão

### 1. Completude é consulta, não flag

A prontidão é lida do estado real de `cte_fiscal_documents` toda vez, e responde **por nota** — nunca
só sim ou não. Por nota faltante ela diz o motivo: sem CT-e, em processamento, rejeitado com o cStat,
ou cancelado.

Uma coluna booleana em `trips` seria mais rápida de ler e impossível de confiar: ela dessincroniza no
instante em que um CT-e é cancelado, e **manifesto emitido sobre flag velha é declaração falsa a
órgão público**. Existe uma coluna derivada (`fiscal_readiness_state`), e ela é índice para filtrar
lista — a consulta é a verdade. O comentário do schema diz isso, porque uma coluna que parece fonte
será usada como fonte.

### 2. O gatilho é evento, não varredura

Quando um CT-e é autorizado, um evento nasce e um consumer pergunta se a viagem daquela nota ficou
completa. O cron varrendo viagens abertas de minuto em minuto seria mais simples de escrever e erraria
pelos dois lados: atrasa o caminhão que está esperando e desperdiça consulta em viagem que não mudou.

### 3. Automático é opção da empresa, e nasce desligado

Emissão fiscal automática é **ação irreversível contra órgão público** — cancelar MDF-e tem janela e
regra própria. Ligar isso por padrão para todo cliente é decidir pelo cliente algo que custa dinheiro
dele quando erra. Quem liga, liga sabendo, e a trilha grava quem ligou.

### 4. O portão é `dispatched`, e vale para o manual também

A garantia inteira desta decisão é a da ADR-0043: **depois de `dispatched` nenhuma nota entra ou sai**,
então o conjunto declarado no manifesto não pode mudar por baixo dele.

A spec deixou em aberto se a emissão **manual** também exigiria `dispatched`. Ela exige — e o motivo é
que permitir o contrário reabre exatamente o buraco que esta garantia fecha: o manifesto declara dez
CT-e, alguém vincula a décima primeira nota, e a declaração passa a ser falsa sem que nada acuse.

O custo prático é pequeno: despachar é um clique, dado no instante em que o caminhão sai. Quem quer
emitir antes da saída despacha e emite — muda a ordem, não a operação. **Se a operação real exigir o
contrário**, o portão está num lugar só e o teste que o trava está nomeado; afrouxar é uma linha, com
a consequência acima escrita ao lado dela.

### 5. Duplicar manifesto é incidente fiscal, e o banco é quem impede

Duas autorizações chegando no mesmo instante não podem virar dois MDF-e. Quem decide isso é um unique
parcial por viagem para manifesto vivo — não um `if` no consumer, que perde a corrida por definição.

### 6. Mais de 50 municípios é recusado com nome

O layout limita a 50; distribuição capilar passa disso. A recusa acontece **na validação da viagem**,
com a lista dos municípios e a sugestão de dividir em duas viagens — nunca como rejeição da SEFAZ
traduzida do jeito que a SEFAZ fala, que é o que manda o operador procurar no Google.

### 7. Emitido não é arquivado

Todo MDF-e da viagem fica acessível da própria viagem — número, chave, status, XML e DAMDFE por URL
assinada e curta —, **inclusive os cancelados e rejeitados, com o motivo**. "Por que esse não valeu?"
é exatamente a pergunta que se faz depois, e um documento fiscal que existe e não abre na tela em que
foi gerado manda a pessoa para o portal da SEFAZ. É assim que o produto passa a ser contornado.

## Consequências

- O operador para de comparar duas telas, e o bloqueio aparece antes do clique em vez de nele.
- A 061 ganha o vínculo viagem → manifesto → CT-e sem reconstruir caminho nenhum.
- **O que não se ganha:** encerramento automático do MDF-e quando a viagem fecha. Manifesto não
  encerrado é pendência na SEFAZ e trava o próximo — é dívida conhecida, e está escrita no
  `evidence.md` da spec em vez de esquecida.

## Alternativas descartadas

| Alternativa                                 | Por que não                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Flag booleana de completude em `trips`      | Dessincroniza no cancelamento de um CT-e, e o manifesto sobre ela é declaração falsa.            |
| Cron varrendo viagens abertas               | Atrasa quem espera e gasta consulta em quem não mudou. O evento já existe no fluxo.              |
| Automático ligado por padrão                | Decide pelo cliente uma ação irreversível contra órgão público.                                  |
| `if` no consumer contra emissão duplicada   | Perde a corrida por definição. A unicidade é do banco.                                           |
| Cancelar o manifesto sozinho na divergência | Cancelamento de MDF-e é decisão fiscal humana, com janela e regra próprias. O sistema **avisa**. |
