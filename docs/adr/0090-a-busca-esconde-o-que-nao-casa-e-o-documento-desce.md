# ADR-0090 — A busca esconde o que não casa, e o documento do destinatário desce

- **Status:** **proposta, revisada em 2026-09-26** depois de o usuário contrariar o §3 original. O
  aceite é a **T0.1 👤** da spec 214: sem ele, nenhuma task da Fase 1 encosta na API, porque §3
  reverte uma decisão de privacidade que hoje está escrita no código. **O gate não mudou — o conteúdo
  de §3 mudou.**
- **Data:** 2026-09-26
- **Decisores:**
  - o usuário, em 2026-09-26: _"precisa add nos itens a busca por entrega com filtro por numero de
    notas, nome do cliente essas coisas para filtrar naquela entrega"_;
  - o usuário, no mesmo dia, sobre o comportamento: **"Digitou 'Mercado' e a tela mostra só as
    paradas e notas desse cliente"** — escolhido contra "rolar até a nota e destacar" e contra "os
    dois, com um botão", que ele recusou explicitamente;
  - o usuário, no mesmo dia, sobre o alcance: **os quatro campos** — número da nota (casando pelo
    fim, porque quem lê um canhoto digita os últimos dígitos), nome do cliente (sem acento nem
    caixa), endereço/bairro/cidade, e CNPJ/CPF (com ou sem ponto e barra);
  - o usuário, no mesmo dia, **contrariando a versão anterior desta ADR**, que propunha descer só o
    CNPJ: **os dois descem, CNPJ e CPF**. O texto que ele leu e escolheu foi _"Como você pediu:
    buscar por CPF também funciona. Em troca, o CPF de cada destinatário pessoa física da viagem passa
    a ficar guardado no celular (o snapshot fica em IndexedDB por até 24 h para funcionar sem rede) —
    e isso entra no `docs/SECURITY.md` como ampliação do que se compartilha"_. Ele aceitou a troca com
    o custo declarado;
  - esta ADR decide o resto: onde a busca roda, o que desce no snapshot, quem nunca se esconde, e o
    que os números da tela passam a contar.
- **Spec:** `specs/214-a-busca-mostra-so-a-entrega-procurada/`
- **Emenda:**
  - `apps/api-transportada/src/trips/application/find-current-driver-trip.use-case.ts:49-53` — o
    comentário "O documento **nunca** sai" **deixa de valer**. O documento do destinatário desce, PF e
    PJ (§3). O comentário tem de ser reescrito na mesma task, ou o código passa a mentir sobre si
    mesmo.
  - `docs/SECURITY.md` — ganha o achado "CPF do destinatário no aparelho do motorista, para a busca
    dentro da viagem", com data, dono e desfecho, no padrão do achado do CPF em claro no Keycloak
    (2026-08-29): decidido conscientemente, com a alternativa recusada registrada.
  - `docs/adr/0075-...` §7 (cópia por valor) — **mantida**, e é a razão de §2: a busca do painel não
    se importa, se reescreve.
- **Mantém:**
  - ADR-0082 / spec 197: a parada é do cliente. Quando a 197 entrar, `recipientNames[]` e o título da
    parada alimentam **o mesmo** casador de §4 — não um segundo.
  - ADR-0088 / spec 206: quem bloqueia as outras paradas continua sendo a parada a caminho. §5 só
    decide que o filtro não a apaga.
  - Spec 103: poda é derivação, nunca apagar o conjunto bruto; e escondido tem de ser dito.
  - Spec 198 D7: o progresso da viagem conta **notas**, e continua contando a viagem inteira (§6).

## Contexto

A tela da viagem do motorista não tem busca nem filtro — é terreno novo. Uma viagem real chega a
dezenas de notas, e o motorista de pé, com o canhoto na mão, precisa achar **aquela** entrega. Hoje
ele rola.

Duas specs de nome parecido **não** são deste assunto, e o nome já enganou uma sessão: a **116** ("vão
lateral e busca inteira") é busca de _lugar para a caixa_ no empacotador 3D, e a **103** ("o filtro
decide o que sai") é filtro do _painel_. Nenhuma das duas tem código reutilizável aqui.

## Decisão

### §1 — A busca esconde o que não casa

Digitar poda a lista: só ficam na tela as paradas e as notas que casam. Não há realce, não há rolagem
automática, não há interruptor entre os dois modos. O usuário escolheu a poda e recusou as
alternativas, e a razão é boa: com uma mão, de pé, rolar até um realce é o trabalho que a busca
deveria ter tirado.

Poda é **derivação**. O snapshot bruto nunca é alterado, filtrado em disco, nem reescrito na fila
offline. A tela é uma projeção; limpar o campo devolve tudo, e nada além do campo muda de estado.

### §2 — A busca roda no aparelho, num serviço próprio desta app

Cliente, 100%, síncrona, sobre o snapshot que a app já carrega inteiro em memória (é PWA
offline-first: uma busca no servidor não funcionaria sem rede, que é exatamente o cenário do
motorista). Custo do teto de schema — 200 paradas — em §7.

Serviço novo, `driverTripSearch.service.ts`, **não** a busca do painel: aquela é
`toLowerCase().includes()` sobre poucos campos, **sem** remoção de acento e **sem** normalização de
pontuação, e por isso erraria três dos quatro campos que o usuário pediu. Importá-la também é
proibido (ADR-0075 §7, cópia por valor). Como é trivial de escrever, a saída certa é escrever melhor.

O que **se reaproveita, de dentro da própria app**, e é o motivo de não haver código novo de
normalização:

- `normalizeSearchText` de `apps/frontend-driver/src/components/ui/searchableSelect.service.ts` —
  `NFD` + tira diacrítico + minúscula. É a única fonte de remoção de acento da app, e continua sendo.
- `normalizeTaxId` de `apps/frontend-driver/src/modules/shared/taxId.service.ts` — tira `. / - ` e
  espaço, sobe a caixa. Já é a fonte de verdade do documento nesta app, inclusive para o CNPJ
  alfanumérico.

### §3 — O documento do destinatário desce no snapshot, PF e PJ

O documento do destinatário **não está** no snapshot hoje. O dado já vem da consulta
(`recipientTaxId: nfeParticipants.taxId`, em
`apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts:710`, no
`DocumentRow` em `:773`) e é descartado de propósito no mapper: só serve para resolver a configuração
do comprovante (`:816-819`) e para `recipientIsCompany` (`:840`). O use case diz, por escrito, "O
documento **nunca** sai".

Buscar por documento sem o documento no aparelho é impossível, e as saídas de fachada não servem:
hash de CPF é força-bruta de 10¹¹ num telefone — segurança que não existe, escrita como se existisse.
Então a escolha é binária: o documento desce, ou a busca por documento não existe.

#### O que esta ADR propunha, e por que caiu

A versão anterior deste §3 dividia por tipo: **CNPJ desce, CPF não** — CNPJ é registro público da
Receita, CPF é dado pessoal, e a minimização da LGPD (art. 6º, III) mandava não levar o CPF para a
ponta mais exposta que temos. A consequência assumida era uma **recusa parcial do pedido**: buscar por
CPF não acharia nada, e a tela teria de explicar isso ao motorista.

**O usuário decidiu o contrário, em 2026-09-26: os dois descem.** A recusa não se sustentou, por três
razões que ele tem e a ADR não tinha:

1. **Ele é o responsável pelo tratamento.** A minimização da LGPD é um princípio que o controlador
   aplica pesando finalidade contra risco — não uma proibição que o desenvolvedor impõe a ele. A
   finalidade aqui é legítima e estreita: achar a entrega certa.
2. **O motorista está entregando para aquela pessoa.** Ele vai bater na porta dela, ler o nome dela no
   canhoto e pedir a assinatura dela. O documento do destinatário não é informação nova para quem já
   tem o endereço, o nome e a nota na mão — e o DANFE impresso que ele carrega já traz o CPF.
3. **O dado já vem do `select` hoje.** Ele já sai do banco, já atravessa a camada de infraestrutura e
   já está em memória no processo da API a cada requisição da viagem. A "proteção" que caiu era o
   descarte de um valor que o sistema já buscou — barata de manter, mas muito menor do que parecia.

O que **não** se sustentava e virou a parte séria: a diferença real não está entre CNPJ e CPF, está
entre "o dado passa pela API" e "o dado fica guardado no celular por 24 h". Essa parte é verdadeira e
está em §3.1.

#### O campo

`recipientTaxId: string | null`, preenchido **sempre** que o destinatário tem documento, PF ou PJ.
**Sem condição de `recipientIsCompany`** — ela sai do mapper, e `recipientIsCompany` volta a servir só
ao que já servia. `null` só quando a NF-e não traz participante destinatário com documento.

`normalizeTaxId` (`apps/frontend-driver/src/modules/shared/taxId.service.ts:17-19`) já normaliza os
dois: tira `.`, `/`, `-` e espaço. O motorista digita `111.222.333-44` ou `11122233344` e casa igual —
é o mesmo caminho do CNPJ, sem ramo novo (§4).

#### §3.1 — O custo é de guarda, não de trânsito

O snapshot da viagem é persistido no aparelho para a app funcionar sem rede. A partir daqui, **o CPF
de cada destinatário pessoa física da viagem fica guardado no celular do motorista**, em texto claro,
no IndexedDB `transportada.driver-trip`, store `trip-snapshot`.

O que **já cobre** esse dado, medido em 2026-09-26, e cobre porque é cego ao conteúdo:

- dono por `subHash` (`SHA-256(sub)`), com `retainOnly` apagando do disco o snapshot de qualquer outro
  dono quando um `sub` autentica (`tripSnapshot.service.ts:87-102`, `indexedDbQueue.service.ts:238-247`);
- prazo de 24 h (`TRIP_SNAPSHOT_MAX_AGE_MS`, `tripSnapshot.service.ts:13`), e o vencido é **removido
  do disco**, não só ignorado na leitura (`:78-81`, `:96-99`);
- viagem toda concluída **apaga** em vez de gravar (`:110-113`), disparado a cada 30 s de leitura;
- "Sair" faz `clear()` da store inteira, **antes** do `logout()` (`signOut.service.ts:8-19`);
- o snapshot é montado por **allowlist explícita** (`driverTripResponse.validation.ts:67-93`,
  `178-194`, `201-226`): a API mandar o campo não basta, ele tem de ser admitido de propósito;
- **não há cache de API no service worker.** `sw.ts` tem 24 linhas, sem `runtimeCaching`, e o cliente
  usa `cache: 'no-store'` (`driverTripClient.service.ts:668`). `service-worker.contract.ts:29` reprova
  se aparecer. Ou seja, **não existe segunda cópia do corpo da resposta em disco** — a única cópia
  persistida é a store `trip-snapshot`.

E duas coisas que ajudam a calibrar: o snapshot **já guarda hoje** `recipientName` e
`recipientDisplayName` do destinatário (`driverTrip.types.ts:23,30`), que também é dado pessoal de
terceiro — o CPF não abre uma categoria nova, aumenta a que já existe. E CPF/CNPJ já vive no aparelho
hoje, em `event-attachments.receiverDocument`, só que de **quem recebeu**, não do destinatário.

O que **não** cobre está em §3.3, e é a parte que o `docs/SECURITY.md` registra.

#### §3.2 — O CPF não é mostrado na tela

Decisão que fecha o buraco mais barato de fechar: **`recipientTaxId` é chave de busca, não conteúdo de
tela.** Ele casa e nunca é renderizado — nem no cartão, nem no detalhe da nota, nem como realce do que
casou. Exatamente como o `district`.

Custa nada e vale muito: quem pega o celular desbloqueado do motorista não **lê** o CPF de ninguém,
porque a tela não o escreve em lugar algum. O motorista também não precisa lê-lo — ele digita o que
está no canhoto que tem na mão. Sobra a leitura por ferramenta de navegador, que é §3.3 item 2.

E a regra que não se negocia, porque também não custa nada: **CPF não vai para log, URL, telemetria
nem mensagem de erro** — nem o termo digitado no campo. Ver §3.4.

O bairro desce no mesmo movimento, e pelo mesmo motivo de não haver segunda mudança de API depois:
`district: string | null`, de `nfeAddresses.district`, **só para busca**, sem aparecer na tela. Hoje
o endereço da parada é um campo único e já formatado (`stop.label` = rua, número, cidade, UF, por
`buildStopLabel`) e o bairro fica fora dele. Mexer no `buildStopLabel` mudaria o rótulo no painel
também; um campo à parte não mexe em nada.

#### §3.3 — As seis travas que não cobrem o CPF, e o conserto de cada uma

Medido em 2026-09-26. Cinco têm conserto nesta spec; **duas voltam ao usuário**.

1. **O boot sem rede abre o snapshot sem autenticação.** `readLastTripSnapshot`
   (`tripSnapshot.service.ts:69-84`) lê o ponteiro `last` e abre o snapshot daquele dono **pela simples
   posse do aparelho** — sem token, sem senha, sem biometria. Risco já registrado em
   `docs/SECURITY.md:130-138`. Hoje expõe nome do destinatário; com CPF lá, exporia CPF de terceiro por
   até 24 h a quem estiver com o celular desbloqueado, inclusive ao motorista seguinte antes de ele
   autenticar. **Conserto nesta spec:** §3.2 — o CPF não é renderizado, então a posse do aparelho não o
   revela na tela. O buraco que sobra é o item 2.
2. **Não há criptografia em repouso, e o CPF ficaria em texto claro no IndexedDB**, legível pelas
   ferramentas do navegador. Risco aceito por escrito em `docs/SECURITY.md:180-182`, e aquele texto diz,
   literalmente, que se o produto passar a guardar mais do que a viagem corrente é para revisitar —
   colocar CPF é exatamente esse gatilho. **Sem conserto barato, e decidido conscientemente pelo
   usuário em 2026-09-26: o documento é gravado no disco** (§3.5), com §3.2 como mitigação.
3. **Nenhum contrato vigia _quais campos_ o snapshot pode conter.** `isStoredTripSnapshot`
   (`:46-51`) só confere que `trips` e `pendingProofs` são arrays; a allowlist decide o que entra mas
   não tem teste dizendo o que **não** pode entrar. **Conserto nesta spec:** contrato que enumera os
   campos de dado pessoal admitidos no snapshot e reprova campo novo não declarado. Passa a ser a
   trava que faltava para qualquer spec futura, não só para esta.
4. **A expiração é preguiçosa: só roda quando alguém lê.** Não há varredura periódica, nem no service
   worker. As 24 h são validade lógica, não expurgo garantido — num aparelho perdido e nunca mais
   aberto, o registro com o CPF fica indefinidamente. **Conserto nesta spec:** uma varredura no boot que
   remove todo registro vencido, de qualquer dono, antes de decidir o modo de arranque. É barato e
   melhora o que já existe.
5. **A fila sobrevive ao "Sair" e tem prazo de 7 dias, não de 24 h.** `field-reports` e
   `event-attachments` não saem no logout, por desenho ("a fila tem dono e espera o dela"). E há
   precedente de campo do destinatário vazando para a fila: `recipientDisplayName` já alimenta
   `receivedBy` hoje. Se o CPF for copiado do snapshot para um evento ou anexo, ele **sai** do regime de
   24 h/`clear` e **entra** no de 7 dias/sem limpeza. **Conserto nesta spec:** proibição explícita —
   `recipientTaxId` nunca entra em `DriverFieldReport` nem em `QueuedAttachment` —, com contrato de
   fonte. O documento que a fila carrega continua sendo só o de **quem recebeu**.
6. **`localStorage` e `sessionStorage` não são varridos no "Sair"**
   (`occurrence-types.v1:<subHash>`, `installation-brand`, `selected-trip`). Hoje é inofensivo.
   **Conserto nesta spec:** nada a consertar, e uma proibição — o CPF não é espelhado para fora do
   IndexedDB, e o contrato do item 3 é o que segura isso.

#### §3.4 — O logger redige o valor, mas não conhece a chave

Medido em 2026-09-26, e o resultado é melhor do que o da coordenada da spec 207 — mas tem um buraco
nomeável.

O logger é o pacote `@adatechnology/logger` (`0.1.0-rc.0`), e ele redige em **duas** camadas:

- **por valor**, em `redactString`: CPF cru de 11 dígitos (`CPF_BARE_PATTERN`), CPF formatado
  (`CPF_FORMATTED_PATTERN`), CNPJ cru de 14, CNPJ formatado e CNPJ alfanumérico com DV válido. Número
  inteiro de 11, 14 ou 44 dígitos também passa por ali (`redactNumber`). Um CPF bem-formado **é**
  redigido, qualquer que seja o nome da chave;
- **por nome de chave**, em `DEFAULT_REDACTED_KEYS`: `cpf`, `cnpj`, `endereco`, `bairro`, `cep` e
  outras, casando por igualdade **ou sufixo** sobre a chave normalizada.

O buraco: `taxid` **não está** na lista. `normalizeKey('recipientTaxId')` dá `recipienttaxid`, que não
é nem termina em `cpf` nem em `cnpj` — então o campo novo depende **só** da camada de valor. E a
camada de valor erra o que não tem a forma canônica: documento com espaços (`111 222 333 44`),
truncado, com dígito faltando, ou colado a outro número.

Pior: `createApiLogger` (`apps/api-transportada/src/main.ts:1373-1381`) **não** passa `extraKeys`, e o
`createLogger` chama `redactMeta(meta)` sem opções — então não há linha de configuração neste
repositório que conserte a lista. As duas saídas honestas:

1. **Nesta spec, e é o que ela faz:** nada neste repositório coloca `recipientTaxId` num objeto de log,
   e um contrato de fonte reprova se alguém colocar. É a defesa que cabe aqui e é testável aqui.
2. **Fora desta spec, como acompanhamento:** `taxid` entra em `DEFAULT_REDACTED_KEYS` no pacote
   `@adatechnology/logger` (repositório `adatechnology-packages`), com bump e publicação. É o conserto
   durável, vale para todos os produtos, e **não** é feito por esta spec porque é outro repositório.

O termo digitado no campo de busca não vai para o servidor em nenhuma hipótese (§2: a busca é local),
então ele não tem como cair em log de API. O que ele poderia sujar é o beacon da app — e por isso o
beacon leva contagem, nunca texto.

Do lado da app não há risco de console: não existe nenhum `console.*` em
`apps/frontend-driver/src/`. A proibição fica como contrato para não nascer um.

#### §3.5 — O documento é gravado no disco. Decidido, não em aberto.

**Decisão do usuário em 2026-09-26**, sobre o item 2 de §3.3 (CPF em texto claro no IndexedDB, sem
criptografia em repouso). O texto que ele leu e escolheu:

> "O documento entra no snapshot em disco. Buscar por CPF funciona no meio do nada, sem sinal, que é o
> cenário real do motorista. Em troca, o número fica no aparelho por até 24 h (menos, se a viagem fechar
> antes) e um telefone desbloqueado nas mãos erradas o entrega a quem souber abrir as ferramentas do
> navegador."

Ele nomeou o custo na própria frase com que aceitou, e é esse o registro: **não é risco que passou sem
ninguém ver.** A mitigação que sustenta a decisão é **§3.2 — o documento nunca é renderizado**: a tela
não escreve o número em lugar nenhum, então "quem souber abrir as ferramentas do navegador" é um degrau
bem mais alto do que "quem pegar o telefone". O que resta está no `docs/SECURITY.md` como "o que falta",
com a decisão registrada ao lado.

E porque a decisão é essa, **as cinco travas de §3.3 que não cobrem o documento deixam de ser
condicionais e passam a ser obrigação da spec 214**: nada renderizado (§3.2, F10), contrato dos campos
de dado pessoal do snapshot (F12), varredura de vencidos no boot (F12), documento fora da fila offline
(F11) e nada espelhado em `localStorage`/`sessionStorage` (F11). Cada uma tem task e critério próprios.

#### Alternativas descartadas

- **O documento só em memória.** A API manda, a app monta o índice de busca e **retira** o campo antes
  de persistir o snapshot; o CPF nunca toca o disco. **Descartada pelo usuário em 2026-09-26.** O
  motivo: no boot sem rede o snapshot vem do disco sem documento, então buscar por CPF só funcionaria
  com sinal — e sem rede é o cenário do motorista. Uma busca que só funciona com sinal não serve para o
  campo, que é justamente onde ela foi pedida.
- **Descer só o CNPJ, deixando o CPF fora.** Descartada pelo usuário no mesmo dia; as razões estão em
  §3, "O que esta ADR propunha, e por que caiu".
- **Hash do documento no aparelho.** Nunca foi opção real: 10¹¹ combinações de CPF é força-bruta num
  telefone — segurança que não existe, escrita como se existisse.

### §4 — Um casamento, quatro campos, e o endereço da parada conta para cada nota

Termos separados por espaço, combinados por **E**: cada termo tem de casar em algum campo. "mercado
sao carlos" acha a nota do MERCADO ABADÉ em São Carlos, com o nome vindo da nota e a cidade vindo da
parada — por isso o endereço da parada conta como campo **de cada nota dela**.

Por campo:

| Campo                                    | Normalização          | Casamento                          |
| ---------------------------------------- | --------------------- | ---------------------------------- |
| número da nota                           | `normalizeTaxId`      | **sufixo** ou igualdade, só dígito |
| documento do destinatário (CNPJ ou CPF)  | `normalizeTaxId`      | contém, de 4 caracteres para cima  |
| nome do cliente (nota e, na 197, parada) | `normalizeSearchText` | contém                             |
| endereço da parada (`label`) e bairro    | `normalizeSearchText` | contém                             |

O número casa **pelo fim**, não por trecho qualquer: quem lê o canhoto digita os últimos dígitos, e
`endsWith` faz `000123` casar com `123` sem que `12` traga a viagem inteira de volta.

Visibilidade, e é a regra inteira:

- uma **nota** aparece quando todo termo casa em pelo menos um dos campos dela ou da parada dela;
- uma **parada** aparece quando tem nota visível, **ou** quando todo termo casa nos campos dela
  mesma — e nesse caso **todas** as notas dela aparecem, porque foi o cliente que casou;
- uma parada visível que esconde notas **diz quantas** ("3 notas escondidas pela busca"). Precedente
  da 103: escondido tem de ser dito.

### §5 — A parada a caminho nunca se esconde

Ela fica na tela mesmo sem casar a busca, com um selo dizendo por que está ali. Duas razões, e as
duas são de correção, não de conforto:

- a 206 bloqueia as outras paradas com um atalho que **rola até a parada a caminho e põe o foco
  nela**. Atalho para um nó que a poda removeu não leva a lugar nenhum — é um botão que não faz nada;
- a busca serve para **achar**; a parada a caminho é a única coisa que o motorista pode **fazer**.
  Esconder o que ele está autorizado a fazer transforma a tela numa mentira útil para ninguém.

Quando ela fica só por essa regra, **todas** as notas dela aparecem — ela não está sob a busca. E
quando a busca não casou nada além dela, a tela diz "nada encontrado" **e** mostra a parada: sem
isso o motorista lê o cartão que sobrou como se fosse o resultado.

Enquanto a 206 não estiver publicada, a regra vale para a **parada corrente** (`findCurrentStop`,
que já existe). Quando a 206 entrar, passa a valer para a parada a caminho — a mesma função de §4,
outra origem de id.

### §6 — Os números da viagem não se mexem. O da busca fica junto do campo.

A barra de progresso e o "N de M notas resolvidas" contam **a viagem inteira**, com busca ligada ou
desligada. Progresso é obrigação com o escritório, não propriedade de uma pesquisa; uma porcentagem
que pula quando se digita não é progresso, é ruído. Debaixo da barra, com a busca ligada, uma linha:
"A barra conta a viagem inteira, não a busca."

O número do resultado nasce **junto do campo de busca**, onde ele foi causado, e só existe com a
busca ligada: "8 notas encontradas · em 3 paradas". Dois números, dois lugares, dois rótulos — é o
que impede cada um de ser lido como o outro.

O contador de cada parada ("N notas para entregar") continua contando a parada inteira, e a linha de
notas escondidas de §4 é o que fecha a conta na tela.

### §7 — Reordenar e buscar não convivem

Com a busca ligada, **reordenar parada fica indisponível**, e a tela diz por que, com um caminho de
volta ("Limpe a busca para mudar a ordem").

Arrastar o segundo item visível para a quinta posição visível não tem significado definido na lista
real, e qualquer mapeamento que se invente — inserir depois do vizinho visível mais próximo, por
exemplo — é um palpite que o motorista não vê e não pode conferir. Reordenar rota é destrutivo; um
palpite invisível é o pior lugar para colocá-lo.

A spec 192, que traz a reordenação, **não tem código**. Esta ADR não implementa a trava: registra a
regra como contrato que a 192 herda, e a 192 é quem a testa quando nascer.

### §8 — A tela fala, e fala para leitor de tela

Campo com rótulo visível, alvo de toque de 44 px (contrato `touch-target` da app vigia), botão de
limpar, e nenhum texto fixo no componente (`driverTrip.locale.json` e o `.en`).

O aviso de "nada encontrado" vai num `role="status"`, com o termo digitado e uma dica do que tentar. O
contador de resultado também é `role="status"`: quem não vê a tela precisa saber que a lista mudou de
tamanho.

**Não há mais ramo de aviso por tipo de documento.** A versão anterior desta ADR precisava dizer ao
motorista que buscar por CPF não achava; com §3, busca por CPF acha, e o aviso volta a ser um só: nada
encontrado, e o que tentar. Cai a chave `search.cnpjOnly` e cai `looksLikeIndividualTaxId`.

## Consequências

**A favor.** O motorista acha a entrega com o canhoto na mão, sem rede, pelos **quatro** campos que
pediu — nenhuma recusa parcial. Nenhum dado novo é pedido à API além de dois campos, e nenhum deles
exige migration. A normalização passa a existir num lugar só da app, e `normalizeTaxId` já serve CPF e
CNPJ sem ramo novo. Poda derivada não pode corromper o snapshot nem a fila offline. E três travas que
faltavam nascem de tabela: contrato dos campos de PII do snapshot, varredura de vencidos no boot, e
proibição de o documento do destinatário vazar para a fila.

**Contra, e assumido.** O CPF de destinatário pessoa física passa a viver em texto claro no IndexedDB
do aparelho por até 24 h, sem criptografia em repouso, e o boot sem rede abre o snapshot pela posse do
aparelho — mitigado por §3.2 (nunca renderizado) mas não eliminado; é o achado do `docs/SECURITY.md` e
o achado do `docs/SECURITY.md` — e é custo **aceito com o risco nomeado pelo próprio usuário** (§3.5),
não custo que escapou. Reordenar exige limpar a busca. Há dois números na tela a explicar em vez de um. A chave
`recipientTaxId` não está na lista de chaves redigidas do logger (§3.4), e o conserto durável é em
outro repositório. E não existe número medido de notas por viagem: a spec mede antes de aceitar o custo
(T0.2), e se o teto doer, a saída prevista é adiar o cálculo por `startTransition`, não paginar.

## Acompanhamento

- `taxid` entra em `DEFAULT_REDACTED_KEYS` do pacote `@adatechnology/logger`, no repositório
  `adatechnology-packages`, com bump e publicação. Fora desta spec, e vale para todos os produtos.
- Revisitar criptografia em repouso do IndexedDB, que `docs/SECURITY.md:180-182` já pedia para
  revisitar quando o produto guardasse mais do que a viagem corrente. Este é o momento em que o gatilho
  disparou.
- Medir notas por viagem em `staging`, por leitura (T0.2 da 214). Sem número, nada de otimizar.
- Quando a 197 entrar: `recipientNames[]` e o título da parada entram no casador de §4, e não num
  segundo caminho.
- Quando a 206 entrar: trocar `findCurrentStop` por `resolveEnRouteStopId` em §5, sem mexer na regra.
- Quando a 192 entrar: implementar e testar a trava de §7.
- A chave de acesso (44 dígitos) fica fora da busca. Se o motorista passar a ler código de barras, é
  spec nova.
