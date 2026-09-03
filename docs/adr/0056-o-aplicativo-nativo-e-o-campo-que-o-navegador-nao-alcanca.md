# ADR-0056 — O aplicativo nativo é o campo que o navegador não alcança

- **Data:** 2026-09-03
- **Estado:** aceita
- **Contexto:** adendo à **ADR-0045** (a viagem cabe no bolso do motorista) e à **ADR-0050 §5**
  (rastreamento ao vivo com consentimento). Abre o repositório `transportada-mobile`.
- **Reverte** a alternativa "app nativo primeiro" descartada na ADR-0045 — mas só a ordem, não o
  argumento: o PWA existe, está em produção, e é ele que define o contrato que este app consome.

## Contexto

A spec 057 entregou o PWA de campo em 2026-08-26, e a ADR-0045 §1 já previa este momento: _"um app
nativo futuro é uma casca nova sobre o mesmo contrato — não uma reescrita de regra"_. As rotas
`/me/trips/current/*` foram desenhadas para o canal, não para a tela, e `me-trip.integration.ts`
executa a viagem inteira — chegar, entregar, ocorrência, devolver, fechar — **sem browser nenhum**.
O contrato está pronto para um segundo consumidor.

O que mudou desde então não é vontade de ter app: é a lista do que o navegador **não faz**, que a
própria 057 deixou escrita no `evidence.md` e que a ADR-0050 §5 ampliou ao pedir posição contínua.

Três limites são de plataforma, não de esforço:

1. **A posição para quando a tela apaga.** O `watchPosition` do navegador é suspenso quando a aba vai
   para segundo plano, e morre quando o aparelho bloqueia. O motorista dirige com o celular no bolso
   ou no suporte com a tela apagada — que é exatamente a janela em que o roteiro precisa ser
   acompanhado. O rastro do portal do contratante (ADR-0050 §5) hoje existe **enquanto alguém segura
   o telefone olhando para ele**, o que não é o uso real.
2. **A fila offline drena só com o app aberto.** A 057 declarou: `Background Sync` não está ligado, e
   a drenagem acontece no evento `online` e na abertura da tela. Confirmação feita no subsolo sobe
   quando o motorista lembra de abrir o app.
3. **A foto não passa pela fila.** O comprovante anexa a uma entrega já confirmada, e foto tirada sem
   sinal **se perde**. Enfileirar arquivo no navegador esbarra em cota de origem e expurgo que o
   navegador decide sozinho.

E dois são de trabalho não feito, que o nativo torna barato em vez de possível:

4. **A assinatura na tela não existe.** A rota aceita `kind: 'signature'` com o nome do recebedor, o
   banco guarda, o contrato está fechado — e o PWA só oferece foto do canhoto.
5. **A conferência do que a câmera vê acontece longe de quem fotografou.** O parser de documento já é
   biblioteca (`@adatechnology/document-intake`, ADR-0054), mas quem lê é o servidor, depois; quem
   fotografou já foi embora.

## Decisão

### 1. O app é casca, e a proibição da ADR-0045 §1 vale igual aqui

Nenhuma regra de viagem mora em componente React Native. O app consome `/me/trips/current/*` como o
PWA consome, e **toda regra nova nasce no domínio**, com o PWA alcançando-a pela mesma rota.

Isso tem um corolário que é a razão de o app ser barato: **funcionalidade que o navegador também
alcança não justifica o app**. Se algo pode ser feito no PWA, é feito no PWA — o app existe para os
cinco itens acima e para os que tiverem a mesma natureza.

E tem uma proibição: **o app não é o lugar de recomeçar o produto**. Tela de escritório, cadastro,
faturamento e documento fiscal continuam onde estão. O papel do app é `driver` e `aggregate`, com
`trip.read` e `trip.report` — **nenhuma permissão nova nasce**, como na ADR-0045 §2.

### 2. A posição em segundo plano é a razão do app, e ela reabre uma decisão em vez de contorná-la

Este é o item que não tem substituto no navegador, e é o que este ADR de fato decide.

A ADR-0045 §3 fixou que _"não existe 'onde ele está agora'"_ e a ADR-0050 §5 já a revisou, criando o
ping contínuo com consentimento. **Este ADR não abre uma terceira política**: ele mantém as três
travas da 0050 §5 — o motorista consente, o ping morre com a viagem, o cliente vê a carga e nunca
quem dirige — e acrescenta as que só existem porque o segundo plano existe:

1. **A permissão de segundo plano é pedida separada, e depois da de uso.** O sistema operacional
   trata as duas como decisões distintas, e pedir a de sempre na primeira abertura é o pedido que a
   pessoa nega. Ela é pedida quando a primeira viagem é despachada, com a razão dita na tela.
2. **O rastreamento só corre com viagem em `dispatched` ou `in_transit`.** Fora disso o app **não
   liga o GPS** — nem para "aquecer", nem para "melhorar a primeira leitura". Sem viagem na rua não
   há o que acompanhar, e a diferença entre um app de trabalho e um rastreador de pessoa é
   exatamente essa.
3. **O motorista vê que está sendo acompanhado, sem precisar procurar.** No Android é a notificação
   persistente que o serviço em primeiro plano exige de qualquer forma; no iOS é o indicador do
   sistema mais um estado visível na própria tela da viagem. Rastreamento que só aparece nos ajustes
   é rastreamento que a pessoa esquece que aceitou.
4. **Desligar é do aparelho, e tem efeito imediato.** Retirar o consentimento pelo app para o envio
   na hora e apaga o rastro na mesma transação, como a 0050 §5 já define para o painel.

**E fecha um buraco que a 0050 §5 deixou aberto, porque o segundo plano o torna grave.** Hoje nada
expira o rastro de uma viagem que nunca fecha: o expurgo é `purgeByTrip`, no fechamento e no
cancelamento. Com a tela na mão isso era um rastro parado; com o segundo plano, uma viagem esquecida
aberta na sexta-feira acompanha o motorista no fim de semana inteiro, em casa. Então:

- **o envio tem teto de idade da viagem**: passado o limite, o app **para de enviar** mesmo com a
  viagem aberta, e a tela diz que parou e por quê;
- **o rastro tem prazo próprio**, independente do fechamento, no mesmo desenho do expurgo de 90 dias
  dos eventos de parada — que já roda e já tem rotina no catálogo.

Nada disso é opcional para a primeira versão com posição: **enquanto o teto e o prazo não
existirem, o app não envia posição em segundo plano.**

### 3. A câmera valida na mão de quem fotografou

O parser é biblioteca desde a ADR-0054 e devolve **o impresso**, canonicalizado. No app ele roda no
aparelho, com uma finalidade só: **dizer na hora que a foto não serve** — documento fora de quadro,
ilegível, ou de tipo diferente do pedido. Refotografar custa dez segundos com a pessoa na frente, e
custa uma viagem de volta depois.

Três limites que impedem isso de virar outra coisa:

1. **A leitura do aparelho é conveniência, nunca prova.** Quem decide continua sendo o servidor, pelo
   caminho que já existe — pelo mesmo motivo da ADR-0053: aceitar a leitura do cliente como verdade
   deixa quem opera o cliente escolher o que o escritório vê.
2. **Divergência avisa, não corrige** — a mesma regra da spec 071. O motorista não é corrigido por um
   palpite de OCR na beira da estrada.
3. **A foto sobe pelo mesmo bucket privado, com chave sem nome de pessoa** (ADR-0045 §7,
   `security.md` §7). O app não ganha caminho de arquivo próprio.

### 4. A assinatura colhe traço e nome, e continua não colhendo CPF

A ADR-0045 §7 decidiu isto e o motivo não mudou: puxar CPF de recebedor traria dado pessoal novo com
criptografia, retenção e trilha próprias, e quando a disputa acontece é o canhoto em papel que a
resolve. O app implementa o `kind: 'signature'` **que a rota já aceita** — área de desenho, toque,
exportação e acessibilidade — sem tocar no contrato.

Se o valor legal da assinatura virar exigência de cliente ou de seguradora, isso é decisão nova, e ela
traz o CPF junto com o custo dele.

### 5. A fila offline é a mesma, e o arquivo entra nela

A idempotência é **do servidor** (ADR-0045 §5): cada confirmação carrega um id gerado no aparelho, e
o servidor o guarda no padrão `*_processed_messages`. O app reusa esse contrato inteiro — dois
aparelhos logados no mesmo motorista continuam não duplicando entrega.

O que ele acrescenta é o item 3 do contexto: **o comprovante entra na fila**, com o arquivo em disco
do app. É aqui que o nativo ganha do navegador — cota do próprio app, expurgo que nós decidimos —, e
é aqui que ele ganha um problema que o PWA não tinha: fila de arquivo cresce. Ela tem teto de
tamanho e descarte declarado, e **a tela diz a verdade sobre o que ainda não subiu**, como a
ADR-0045 §5 exige. Mentir sobre sincronização é pior que não ter offline.

### 6. A instalação é escolhida na primeira tela, e o token nunca sai do keychain

Cada deploy é de uma transportadora só (ADR-0021), e o app não sabe de qual antes de alguém dizer.
A primeira tela tem **um campo**: a URL da instalação. Dela saem marca, logotipo e Keycloak, pelas
rotas anônimas `/public/landing-*` que já existem — as mesmas que o painel web consome. Rota nova
para isto acrescentaria superfície anônima para servir o mesmo byte.

A URL **não é segredo** e mora no armazenamento comum. O token mora no keychain, e a credencial é
digitada no tema do Keycloak, por authorization code + PKCE no navegador do sistema: o realm mantém
`directAccessGrantsEnabled: false` em todo cliente (ADR-0047), e webview embutida veria a senha.

### 7. O app é repositório próprio, e não importa código de ninguém

`transportada-mobile` fica fora do monorepo. Ele não é workspace de `transportada` e **não importa
código-fonte dele** — a mesma regra que vale entre as apps de lá. O que precisar ser comum vira
pacote publicado, como `@adatechnology/document-intake` já é.

O custo disso é conhecido e aceito: **cópia por valor** do que os dois lados precisam dizer igual, com
contrato de paridade em cada lado, como já acontece com `FUEL_TYPES` e `VEHICLE_TYPES`. E o corte é o
mesmo da ADR-0054: o que diverge calado — parser, política fiscal — vira pacote; o que se confere de
olho, cópia.

## Consequências

- O rastro do portal do contratante passa a existir no uso real, e não só enquanto alguém segura o
  telefone. É a ADR-0050 §5 entregando o que decidiu.
- A confirmação feita sem sinal sobe sozinha, e a foto tirada sem sinal deixa de se perder.
- O expurgo do rastro deixa de depender de a viagem fechar — defeito que já existia e que só o
  segundo plano tornava perigoso.
- O escritório passa a receber comprovante conferido no momento da foto, e não a descobrir o
  documento ilegível depois.
- **O que não se ganha:** nada do escritório. E nenhuma regra de viagem nova — se ela aparecer no
  app, ela vazou do domínio, e o teste que prova isso continua sendo a integração sem browser.
- **O custo que se assume:** duas lojas, dois ciclos de revisão e uma versão instalada que o usuário
  decide quando atualizar. Servidor que quebra contrato com app antigo em campo é falha nova, que o
  PWA nunca teve — o contrato de `/me/trips/current/*` passa a ser público de verdade.

## Alternativas descartadas

| Alternativa                                      | Por que não                                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Continuar só no PWA                              | Os itens 1 a 3 do contexto são limite de plataforma. Nenhum esforço no navegador liga o GPS com a tela apagada.                          |
| App nativo reescrevendo a regra de viagem        | É a bifurcação que a ADR-0045 §1 proibiu. Duas implementações da máquina de estados divergem no primeiro caso raro.                      |
| Wrapper de webview sobre o PWA                   | Herda os três limites de plataforma — é o mesmo motor — e ainda perde a tela do Keycloak fora da webview.                                |
| Rastrear sempre, com a viagem ou sem             | É rastreador de pessoa com outro nome. A trava de `dispatched`/`in_transit` é o que separa as duas coisas.                               |
| Aceitar a leitura do documento feita no aparelho | ADR-0053: quem opera o cliente escolheria o que o operador vê.                                                                           |
| Assinatura com CPF do recebedor                  | ADR-0045 §7 — dado pessoal novo, desproporcional ao ganho, e a disputa se resolve no canhoto de papel.                                   |
| App dentro do monorepo                           | Nenhuma app importa código de outra ali, e o ciclo de release do app é de loja, não de deploy.                                           |
| Adiar o expurgo do rastro para "depois"          | Com segundo plano, viagem esquecida aberta acompanha o motorista em casa. É a diferença entre um defeito e um incidente de dado pessoal. |
