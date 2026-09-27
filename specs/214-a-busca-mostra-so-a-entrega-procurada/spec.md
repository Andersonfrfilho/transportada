# Feature 214 — A busca mostra só a entrega procurada

> **ADR:** `docs/adr/0090-a-busca-esconde-o-que-nao-casa-e-o-documento-desce.md` (proposta; o aceite é
> a T0.1 👤). A ADR decide; esta spec descreve o comportamento e os contratos.
>
> **Revisão 2 (2026-09-26):** o usuário **contrariou** o §3 original, que descia só o CNPJ. **Os dois
> descem, CNPJ e CPF.** Cai a condição no mapper, cai o aviso de "só CNPJ" na tela, e cai a recusa
> parcial do pedido. Em troca, o CPF passa a viver no aparelho e isso entra no `docs/SECURITY.md`.
> A história inteira está em ADR-0090 §3, "O que esta ADR propunha, e por que caiu".

## Problema e resultado

A tela da viagem do motorista **não tem busca nem filtro**. Numa viagem com dezenas de notas, achar
"aquela" entrega é rolar a lista de pé, com uma mão, com o canhoto na outra.

Palavras do usuário (2026-09-26):

> "precisa add nos itens a busca por entrega com filtro por numero de notas, nome do cliente essas
> coisas para filtrar naquela entrega"

E, sobre o comportamento, escolhendo entre três opções:

> "Digitou 'Mercado' e a tela mostra só as paradas e notas desse cliente"

Ele **recusou** "rolar até a nota e destacar" e "os dois, com um botão".

**Resultado:** um campo de busca no alto da lista de paradas. O que não casa sai da tela; o que casa
fica. Quatro campos casam — número da nota, nome do cliente, endereço, documento do destinatário
(CNPJ ou CPF) —, a
busca roda no aparelho (funciona sem rede), a parada a caminho nunca desaparece, e os números da
viagem continuam sendo da viagem.

### Duas specs de nome parecido que não são deste assunto

O nome já enganou uma sessão, então fica escrito aqui para a próxima não cair de novo:

- **116 — "vão lateral e busca inteira"** é o empacotador 3D: busca de **lugar para a caixa** dentro
  do baú. Nada a ver com busca de texto.
- **103 — "o filtro decide o que sai"** é filtro do **painel**, não da app do motorista.

Da 103 vale só o **precedente**, e vale: poda é derivação (interseção, nunca apagar o conjunto
bruto), e marcação escondida tem de ser dita ("N notas marcadas estão fora do filtro").

## Fora do escopo

- Busca no servidor, paginação, índice remoto. É PWA offline-first; ver ADR-0090 §2.
- Chave de acesso (44 dígitos) e leitura de código de barras como entrada de busca.
- **Mostrar o documento do destinatário na tela.** Ele desce para **casar busca** e nunca é renderizado
  — nem no cartão, nem no detalhe da nota, nem como realce (ADR-0090 §3.2).
- Criptografia em repouso do IndexedDB. O usuário decidiu em 2026-09-26 **gravar no disco**, com o risco
  nomeado por ele (ADR-0090 §3.5); a alternativa de manter o documento só em memória foi **descartada**,
  porque buscar por CPF passaria a exigir sinal. Fica como "o que falta" no `docs/SECURITY.md`.
- Consertar a lista de chaves redigidas do `@adatechnology/logger` (`taxid`). É outro repositório; esta
  spec garante que nada aqui coloque o campo em log (ADR-0090 §3.4).
- Mostrar o bairro na tela. Ele desce **só** para casar busca; o rótulo da parada não muda.
- Realce do que casou, rolagem automática, interruptor entre poda e realce. Recusados pelo usuário.
- Implementar a trava de reordenação. A spec **192 não tem código**; a regra fica registrada aqui e a
  192 a implementa (ADR-0090 §7).
- Mexer em `buildStopLabel` ou no rótulo da parada no painel.
- Ordenar o resultado por relevância. A ordem das paradas é a ordem da rota, sempre.

## Histórias priorizadas

### P1 — Achar a nota pelos últimos dígitos do canhoto

**Given** uma viagem com a nota `000123` na parada 4 e mais 30 notas em outras paradas
**When** o motorista digita `123` no campo de busca
**Then** a tela mostra a parada 4 com a nota `000123`, e as outras paradas saem da tela
**And** o número do resultado aparece junto do campo: "1 nota encontrada · em 1 parada".

### P1 — Achar o cliente sem acento e sem caixa

**Given** uma parada cujo destinatário é `MERCADO ABADÉ LTDA`
**When** o motorista digita `mercado abade`
**Then** a parada e as notas desse cliente ficam na tela, e o resto sai.

### P1 — Os números da viagem não mentem com a busca ligada

**Given** uma viagem de 6 notas, 1 resolvida, e uma busca que casa 2 notas
**When** a busca está ligada
**Then** a barra de progresso e o "1 de 6 notas resolvidas" continuam contando a viagem inteira
**And** debaixo da barra aparece "A barra conta a viagem inteira, não a busca"
**And** junto do campo aparece "2 notas encontradas · em 1 parada".

### P1 — A parada a caminho não desaparece

**Given** a parada 2 a caminho (ou, até a 206 entrar, a parada corrente)
**When** o motorista busca por um cliente que só existe na parada 5
**Then** a parada 5 aparece filtrada **e** a parada 2 continua na tela, com o selo "A caminho — fica
na tela mesmo fora da busca", com **todas** as notas dela visíveis.

### P2 — Busca que não acha nada diz isso

**Given** qualquer viagem
**When** o motorista digita `zzz`
**Then** nenhuma parada casada aparece, e um aviso em `role="status"` diz `Nada encontrado para
"zzz"` com a dica do que tentar
**And** se a parada a caminho estiver na tela, o aviso aparece **mesmo assim** — senão o cartão que
sobrou é lido como resultado.

### P1 — Achar pelo documento, PJ ou PF, com ou sem pontuação

**Given** um destinatário de CNPJ `12.345.678/0001-99` na parada 3 e um de CPF `111.222.333-44` na
parada 5
**When** o motorista digita `12345678` ou `12.345.678`
**Then** as notas do destinatário PJ ficam na tela
**And When** ele digita `111.222.333-44` ou `11122233344`
**Then** as notas do destinatário PF ficam na tela
**And** em nenhum dos dois casos o documento aparece escrito na tela.

### P1 — O documento casa mas não se mostra

**Given** uma busca que casou pelo CPF do destinatário
**When** a parada e a nota aparecem
**Then** o cartão mostra nome, endereço, número, volumes e valor **e nenhum documento**
**And** quem pegar o aparelho desbloqueado não lê o CPF de ninguém na tela.

### P2 — Parada visível que esconde nota diz quantas

**Given** uma parada com 4 notas, das quais 1 casa a busca pelo número
**When** a busca está ligada
**Then** a parada aparece com 1 nota, o contador dela continua dizendo quantas notas tem para
entregar, e uma linha diz "3 notas escondidas pela busca".

### P3 — Limpar devolve tudo

**Given** uma busca ligada, com paradas escondidas
**When** o motorista toca em "Limpar busca" (ou apaga o campo)
**Then** a lista volta inteira, na ordem da rota, sem nenhum outro estado alterado — nenhum cartão
abre ou fecha por causa disso, nenhuma foto é perdida, nenhum item da fila muda.

## Requisitos funcionais

### F1 — O campo

Um campo de texto no alto da lista de paradas, acima do primeiro cartão e **abaixo** da barra de
progresso. Rótulo visível (`search.label`), _placeholder_ com os campos que casam
(`search.placeholder`), botão de limpar quando há texto (`search.clear`). Estado só na tela: não vai
para URL, `localStorage`, fila offline, nem para o servidor. Recarregar a app começa sem busca.

### F2 — Normalização

- Texto: `normalizeSearchText` de `apps/frontend-driver/src/components/ui/searchableSelect.service.ts`
  — `NFD`, tira diacrítico, minúscula. **Não** criar função nova de acento nesta app.
- Documento e número de nota: `normalizeTaxId` de
  `apps/frontend-driver/src/modules/shared/taxId.service.ts` — tira `.`, `/`, `-` e espaço, sobe a
  caixa.

### F3 — Termos

A consulta é partida por espaço em branco; espaços extras não contam. Os termos combinam por **E**:
cada termo tem de casar em algum campo. Consulta só de espaços é consulta vazia (busca desligada).

### F4 — Campos e casamento

| Campo                                   | Origem                                                     | Casamento                          |
| --------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| número da nota                          | `document.number`                                          | **sufixo** ou igualdade, só dígito |
| documento do destinatário (CNPJ ou CPF) | `document.recipientTaxId` (novo, F7)                       | contém, ≥ 4 caracteres             |
| nome do cliente                         | `document.recipientName` + `document.recipientDisplayName` | contém                             |
| endereço da parada                      | `stop.label`                                               | contém                             |
| bairro da parada                        | `stop.district` (novo, F7)                                 | contém                             |

O endereço e o bairro da parada contam como campos **de cada nota dela** — é o que faz "mercado sao
carlos" casar com o nome vindo da nota e a cidade vindo da parada.

### F5 — Visibilidade

- Uma **nota** aparece quando **todo** termo casa em algum campo dela ou da parada dela.
- Uma **parada** aparece quando tem nota visível, **ou** quando todo termo casa nos campos dela mesma
  (`label`, `district`) — e nesse caso **todas** as notas dela aparecem, porque o cliente casou.
- Parada sem nota nenhuma no snapshot aparece só pelos campos dela.
- Poda é **derivação**: o snapshot não é alterado, filtrado em disco nem reescrito. A ordem das
  paradas e das notas é a original.

### F6 — A parada a caminho

A parada corrente (`findCurrentStop` de
`apps/frontend-driver/src/modules/driver-trip/shared/driverTripProgress.service.ts`) **nunca é
escondida** pela busca. Quando fica só por essa regra:

- todas as notas dela aparecem (ela não está sob a busca);
- um selo diz por que ela está ali (`search.enRouteKept`);
- ela **não** conta no número do resultado;
- se nada mais casou, o aviso de "nada encontrado" aparece **junto** dela.

Quando 206 entrar, a origem do id passa a ser a parada a caminho; a regra não muda.

### F7 — Dois campos novos no snapshot

Na API, em `DriverTripDocument` e `DriverTripStop`:

- `recipientTaxId: string | null` — o documento do destinatário, **PF e PJ, sem condição**. A condição
  de `recipientIsCompany` da revisão 1 **caiu**, e `recipientIsCompany` volta a servir só ao que já
  servia. `null` só quando a NF-e não traz participante destinatário com documento. O dado já vem do
  `select` (`recipientTaxId: nfeParticipants.taxId`, em
  `drizzle-current-driver-trip.repository.ts:710`) e hoje é descartado no `toDriverDocument`; passa a
  ser repassado.
- `district: string | null` — de `nfeAddresses.district`, **só para busca**. Não aparece na tela, não
  entra no `buildStopLabel`, não muda o rótulo no painel.

O comentário "O documento **nunca** sai" em `find-current-driver-trip.use-case.ts:49-53` tem de ser
reescrito na mesma task, ou o código passa a mentir sobre si mesmo.

### F10 — O documento casa e não se mostra

`recipientTaxId` é **chave de busca, não conteúdo de tela** (ADR-0090 §3.2). Nunca é renderizado: nem
no cartão da parada, nem no detalhe da nota, nem como realce do que casou, nem em `title`, `aria-label`
ou atributo `data-*`. Tratado como o `district`.

É a mitigação do buraco principal: o boot sem rede abre o snapshot pela posse do aparelho
(`readLastTripSnapshot`), então a tela não escrever o documento é o que impede que pegar o celular
desbloqueado seja ler o CPF de terceiros. O motorista não precisa lê-lo — ele digita o que está no
canhoto que tem na mão.

### F11 — O documento não sai do snapshot para lugar nenhum

`recipientTaxId` **nunca** é copiado para:

- `DriverFieldReport` (fila `field-reports`) nem `QueuedAttachment` (store `event-attachments`) — as
  duas sobrevivem ao "Sair" por desenho e têm prazo de 7 dias, não de 24 h. Há precedente de campo do
  destinatário vazando para lá: `recipientDisplayName` já alimenta `receivedBy`. O documento que a fila
  carrega continua sendo só o de **quem recebeu** (`receiverDocument`);
- `localStorage` ou `sessionStorage` — nenhum dos dois é varrido no "Sair";
- log, `console.*`, URL, query string, beacon, telemetria ou mensagem de erro — nem o termo digitado no
  campo de busca. Não existe nenhum `console.*` em `apps/frontend-driver/src/` hoje, e a proibição é
  para não nascer um.

### F12 — Duas travas que faltavam no snapshot

Nascem aqui porque o campo novo as exige, e passam a valer para qualquer spec futura:

- **Contrato dos campos de dado pessoal do snapshot.** Hoje `isStoredTripSnapshot` só confere que
  `trips` e `pendingProofs` são arrays, e a allowlist de `toDriverTripSnapshot` decide o que entra mas
  não tem teste dizendo o que **não** pode entrar. O contrato novo enumera os campos de dado pessoal
  admitidos e reprova campo não declarado.
- **Varredura de vencidos no boot.** A expiração de 24 h é preguiçosa: só roda quando alguém lê aquele
  registro. Passa a haver uma passada no boot que remove todo registro vencido, **de qualquer dono**,
  antes de decidir o modo de arranque. Não alcança o aparelho nunca mais aberto, e isso está dito no
  `docs/SECURITY.md`.

### F8 — Números

- Barra de progresso e `progress.notes` / `progress.label` / `progress.percent`: **inalterados**,
  sempre a viagem inteira. `computeTripProgress` e `computeTripNoteProgress` recebem a viagem crua,
  nunca o resultado da busca.
- Com a busca ligada, uma linha debaixo da barra: `search.progressScope`.
- Junto do campo, com a busca ligada, o resultado: `search.resultNotes` + `search.resultStops`,
  contando só o que casou (a parada de F6 não entra).
- `documentsPending` de cada parada: **inalterado**, conta a parada inteira.
- Parada visível que esconde nota: `search.hiddenNotes` com a diferença.

### F9 — Reordenação

Com a busca ligada, reordenar parada fica **indisponível**, com o motivo na tela
(`search.reorderBlocked`). Contrato herdado pela spec **192**, que é quem tem o código; esta spec só
registra a regra e a chave de tradução.

## Requisitos não funcionais

### N1 — Custo

Índice normalizado construído **uma vez por snapshot** (`useMemo` pela identidade da viagem), não a
cada tecla. Cada tecla é varredura de subcadeia sobre o índice.

Orçamento: **≤ 16 ms** por tecla no teto de schema (200 paradas) num Android de faixa média. Não há
número medido de notas por viagem — **T0.2 mede antes** de qualquer otimização. Se o teto doer, a
saída prevista é adiar o cálculo (`startTransition`), **não** paginar nem mover a busca para o
servidor.

### N2 — Privacidade

O documento do destinatário passa a viver **em texto claro no IndexedDB do aparelho** por até 24 h.
Isso é ampliação do que se compartilha, está assumido na ADR-0090 §3 e registrado em `docs/SECURITY.md`
como achado aberto com data, dono e desfecho.

O que a spec garante, e cada item é contrato:

- o documento **não é renderizado** (F10);
- o documento **não sai** do snapshot para fila, `localStorage`, log, URL, beacon ou telemetria (F11);
- o snapshot ganha contrato de campos de dado pessoal e varredura de vencidos no boot (F12);
- **não existe segunda cópia em disco**: `sw.ts` não tem `runtimeCaching` e o cliente usa
  `cache: 'no-store'`, vigiado por `test/shared/service-worker.contract.ts`. A spec não pode introduzir
  cache de API.

O que a spec **não** resolve, e está no `docs/SECURITY.md` como "o que falta": criptografia em repouso,
a chave `taxid` fora da lista de redação do logger (conserto em outro repositório), e o aparelho nunca
mais aberto, em que as 24 h são validade lógica e não expurgo.

### N3 — Acessibilidade e mobile

- Campo com `<label>` visível associado, não só _placeholder_.
- Alvo de toque ≥ 44 px no campo e no botão de limpar — o contrato
  `apps/frontend-driver/test/shared/touch-target.contract.ts` já vigia, e ele **lê o CSS**: altura
  literal abaixo de 44 px reprova.
- Aviso de "nada encontrado" e contador de resultado em `role="status"`.
- Funciona em 375 px sem rolagem horizontal; o campo não cobre o primeiro cartão.
- Teclado: o campo não rouba foco ao abrir a tela (o motorista chega para trabalhar, não para
  digitar).

### N4 — i18n

Nenhum texto fixo no componente. Todas as chaves em
`apps/frontend-driver/src/modules/driver-trip/locales/driverTrip.locale.json` **e** no `.en`, no
namespace `driverTrip`, sob o bloco `search`. Plural por `_one`/`_other`.

### N5 — Cópia por valor

ADR-0075 §7: nada é importado de `apps/frontend-transportada`. A busca do painel
(`toLowerCase().includes()`, sem acento e sem pontuação) não serve e não se copia — escreve-se melhor.

## Preview

Mockups em ~40 colunas, 375 px. A lista, com a busca desligada:

```text
┌────────────────────────────────────────┐
│ ████████░░░░░░░░░░░░░░░░  1 de 6 notas │
│ 16% da viagem                          │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ Buscar nesta viagem                    │
│ ┌────────────────────────────────────┐ │
│ │ 🔎 Nota, cliente, endereço ou CNPJ │ │  ← 44 px
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ PARADA 1                             ⌄ │
│ Rua das Flores, 120, SAO CARLOS, SP    │
│ [✓ Entregue]                           │
├────────────────────────────────────────┤
│ PARADA 2                             ⌄ │
│ Av. Brasil, 900, SAO CARLOS, SP        │
│ [● Em andamento]                       │
│ 3 notas para entregar                  │
├────────────────────────────────────────┤
│ PARADA 3                             ⌄ │
│ Rua do Porto, 45, ARARAQUARA, SP       │
│ 2 notas para entregar                  │
└────────────────────────────────────────┘
```

Com `mercado abade` digitado — a parada 3 é do MERCADO ABADÉ, a 2 é a corrente e fica:

```text
┌────────────────────────────────────────┐
│ ████████░░░░░░░░░░░░░░░░  1 de 6 notas │
│ 16% da viagem                          │
│ A barra conta a viagem inteira, não a  │
│ busca.                                 │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ Buscar nesta viagem                    │
│ ┌──────────────────────────────────┬─┐ │
│ │ mercado abade                    │✕│ │
│ └──────────────────────────────────┴─┘ │
│ 2 notas encontradas · em 1 parada      │  ← role="status"
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ PARADA 2                             ⌄ │
│ Av. Brasil, 900, SAO CARLOS, SP        │
│ [● Em andamento]                       │
│ [↗ A caminho — fica na tela mesmo fora │
│    da busca]                           │
│ 3 notas para entregar                  │
├────────────────────────────────────────┤
│ PARADA 3                             ⌃ │
│ Rua do Porto, 45, ARARAQUARA, SP       │
│ MERCADO ABADÉ LTDA                     │
│ 2 notas para entregar                  │
│  ├ NF 000141 · 12 vol · R$ 1.240,00    │
│  └ NF 000142 · 3 vol · R$ 310,00       │
└────────────────────────────────────────┘
```

Parada 1 saiu. A 2 ficou por F6, com todas as notas, e **não** entrou na contagem do resultado.

Uma parada que casou por uma nota só, escondendo as outras três:

```text
┌────────────────────────────────────────┐
│ PARADA 3                             ⌃ │
│ Rua do Porto, 45, ARARAQUARA, SP       │
│ 4 notas para entregar                  │  ← a parada inteira
│  └ NF 000123 · 2 vol · R$ 88,00        │
│ 3 notas escondidas pela busca          │
└────────────────────────────────────────┘
```

Busca que não casa nada, com a parada corrente na tela:

```text
┌────────────────────────────────────────┐
│ Buscar nesta viagem                    │
│ ┌──────────────────────────────────┬─┐ │
│ │ zzz                              │✕│ │
│ └──────────────────────────────────┴─┘ │
│ ┌────────────────────────────────────┐ │
│ │ Nada encontrado para "zzz".        │ │  ← role="status"
│ │ Tente o número da nota, o nome do  │ │
│ │ cliente, o endereço ou o CNPJ/CPF. │ │
│ │           [ Limpar busca ]         │ │  ← 44 px
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ PARADA 2                             ⌄ │
│ Av. Brasil, 900, SAO CARLOS, SP        │
│ [● Em andamento]                       │
│ [↗ A caminho — fica na tela mesmo fora │
│    da busca]                           │
│ 3 notas para entregar                  │
└────────────────────────────────────────┘
```

O aviso aparece **acima** da parada mantida, e isso é de propósito: lido de cima para baixo, o
motorista sabe que aquele cartão não é o resultado.

Com a busca ligada e a reordenação da 192 no ar (quando ela existir):

```text
│ [ ⇅ Mudar a ordem ]  (desativado)      │
│ Limpe a busca para mudar a ordem.      │
```

## Casos extremos e falhas

| Caso                                        | Comportamento                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| snapshot antigo, sem `recipientTaxId`       | `null`; busca por documento não casa nada nele. Nunca quebra, e o campo nunca é renderizado  |
| snapshot antigo, sem `district`             | `null`; busca de endereço cai só no `label`                                                  |
| destinatário pessoa física                  | `recipientTaxId` vem com o **CPF**; casa igual ao CNPJ, e não é mostrado na tela             |
| viagem sem parada                           | campo de busca aparece e não acha nada; nenhum erro                                          |
| parada sem nota                             | casa só pelos campos dela                                                                    |
| consulta só de espaço                       | busca desligada; lista inteira                                                               |
| consulta de 1 dígito (`7`)                  | casa notas terminadas em 7. É ruidoso e está correto — o usuário pediu pelo fim              |
| consulta de 1–3 caracteres de documento     | não casa documento (mínimo 4); casa nome e endereço normalmente                              |
| CNPJ alfanumérico (`AB123456789012`)        | `normalizeTaxId` sobe a caixa; casa igual                                                    |
| número com zeros à esquerda (`000123`)      | `123` casa por sufixo                                                                        |
| cliente com nome só na `tradeName`          | fora do escopo: casa `recipientName` e `recipientDisplayName`, que é o que existe            |
| busca ligada e nota muda de estado na fila  | poda é recalculada do snapshot; a nota pode sair da tela ao mudar de estado, e isso é aceito |
| busca ligada e snapshot recarrega           | o texto do campo permanece; o índice é reconstruído                                          |
| sem rede                                    | funciona igual — é tudo local                                                                |
| parada corrente não existe (viagem fechada) | F6 não mantém ninguém; poda pura                                                             |

## Critérios de aceite

Cada item abaixo é um teste de contrato, escrito **antes** da implementação.

### A — Normalização e termos

1. `mercado abade` casa `MERCADO ABADÉ LTDA`; `MERCADO` casa `mercado`.
2. `12.345.678/0001-99`, `12345678000199` e `12345678` casam o mesmo CNPJ; `111.222.333-44` e
   `11122233344` casam o mesmo CPF.
3. `  mercado   abade  ` é igual a `mercado abade`.
4. `mercado araraquara` casa a nota do mercado **na** parada de Araraquara, e não a do mesmo mercado
   em outra cidade — E entre termos, com campos de nota e de parada juntos.
5. Consulta vazia ou só de espaço devolve a viagem inteira, com as notas na ordem original.

### B — Número da nota

6. `123` casa `000123` (sufixo) e casa `123` (igualdade).
7. `123` **não** casa `001234` — é sufixo, não trecho qualquer.
8. `12` casa `000112` e `000212`; o teste registra que isso é ruído aceito.

### C — Documento

9. Nota de destinatário **PJ** tem `recipientTaxId` preenchido no snapshot, e o CNPJ casa a busca.
10. Nota de destinatário **PF** tem `recipientTaxId` preenchido com o **CPF**, e o CPF casa a busca —
    com e sem ponto. É o teste que substitui o da revisão 1, que provava a exclusão do CPF; a asserção
    "o CPF não sai nem como campo vazio" **sai da suíte**.
11. Termo de 3 caracteres não casa documento nenhum.
12. Snapshot sem o campo (versão antiga) não quebra a busca nem a tela.

### D — Visibilidade

13. Parada que casa só por uma nota mostra **essa** nota e diz quantas escondeu.
14. Parada que casa pelo próprio endereço mostra **todas** as notas dela, sem linha de escondidas.
15. Parada sem nota visível e sem casar pelos próprios campos **sai** da tela.
16. O snapshot de entrada não é mutado: comparação profunda antes e depois de filtrar.
17. A ordem das paradas e das notas no resultado é a ordem do snapshot.

### E — A parada a caminho

18. Busca que não casa a parada corrente mantém a parada corrente na tela, com todas as notas.
19. A parada mantida por F6 **não** entra em `resultNotes` nem em `resultStops`.
20. Busca que não casa nada, com parada corrente existente, produz **os dois**: o aviso de nada
    encontrado e a parada.
21. Viagem sem parada corrente não mantém ninguém.
22. O atalho da 206 (quando existir) aponta para um nó renderizado — teste de fonte: a parada
    devolvida por `findCurrentStop` está sempre no resultado visível.

### F — Números

23. Com busca ligada, `computeTripNoteProgress` e `computeTripProgress` recebem a viagem crua:
    `{ percent, resolved, total }` é idêntico com e sem busca.
24. `documentsPending` de cada parada visível conta a parada inteira, não o filtrado.
25. `search.progressScope` aparece **só** com a busca ligada.
26. `resultNotes`/`resultStops` aparecem **só** com a busca ligada, e contam o que casou.

### G — Tela, acessibilidade, i18n

27. O campo tem `<label>` associado por `htmlFor`/`id`.
28. Aviso de nada encontrado e contador de resultado têm `role="status"`.
29. `touch-target.contract.ts` continua verde com o CSS novo.
30. Toda chave nova existe nos **dois** locales, com os mesmos nomes e os mesmos plurais — o
    `catalog-parity.contract.ts` da app é o lugar, se ele já compara locales; se não, teste próprio.
31. Nenhum literal de texto de interface no componente novo (teste de fonte, como o da 198 faz).
32. Limpar a busca não altera nenhum outro estado: cartão aberto continua aberto, foto anexada
    continua anexada, fila intacta.

### H — Custo

33. Índice construído uma vez por snapshot: contador de chamadas de normalização não cresce com o
    número de teclas.
34. Medição registrada em `evidence.md` para o teto de 200 paradas, com o número real de notas por
    viagem medido na T0.2.

### P — Privacidade do documento

35. **O documento não aparece renderizado** (F10): busca que casou por CPF produz cartão sem o
    documento em texto, em `title`, em `aria-label` ou em `data-*`. Teste de fonte mais teste de saída.
36. **O documento não vaza do snapshot** (F11): teste de fonte reprovando `recipientTaxId` dentro de
    `DriverFieldReport`, de `QueuedAttachment`, de `localStorage`/`sessionStorage`, de `console.*` e de
    qualquer objeto de log ou beacon.
37. **Contrato de campos de dado pessoal do snapshot** (F12): a lista dos campos admitidos é explícita,
    e campo novo não declarado reprova.
38. **Varredura de vencidos no boot** (F12): registro de outro dono, vencido, é removido do disco no
    boot, antes de decidir o modo de arranque.
39. **Sem cache de API**: `service-worker.contract.ts` continua verde — nenhuma `runtimeCaching` nasceu,
    e o cliente continua com `cache: 'no-store'`.

## Dúvidas

**Nenhuma aberta.** As quatro abaixo estão decididas — Q1 e Q4 pelo próprio usuário em 2026-09-26,
Q2 e Q3 pela spec —, nenhuma é `[NEEDS CLARIFICATION]`, e por isso o `tasks.md` traz o prompt de
execução. A T0.1 👤 é o aceite da ADR inteira e já decidida, não uma pergunta.

**Q1 — O CPF também desce? FECHADA em 2026-09-26.** A revisão 1 decidiu **não** (CNPJ é registro
público; CPF é dado pessoal, e o aparelho do motorista é a ponta mais exposta), ao custo de uma recusa
parcial do pedido. **O usuário decidiu o contrário: os dois descem.** A recusa não se sustentou — ele é
o responsável pelo tratamento e pesa finalidade contra risco; o motorista está entregando para aquela
pessoa e o DANFE que ele carrega já traz o CPF; e o dado já vinha do `select` hoje, então a proteção que
caiu era o descarte de um valor que o sistema já buscava. Em troca, o CPF passa a ficar no aparelho, e
isso entrou no `docs/SECURITY.md`. História completa em ADR-0090 §3.

**Q4 — O CPF fica no disco ou só em memória? FECHADA em 2026-09-26.** O usuário decidiu **gravar no
disco**, nomeando o custo na frase com que aceitou: _"Buscar por CPF funciona no meio do nada, sem
sinal, que é o cenário real do motorista. Em troca, o número fica no aparelho por até 24 h (menos, se a
viagem fechar antes) e um telefone desbloqueado nas mãos erradas o entrega a quem souber abrir as
ferramentas do navegador."_ A alternativa de manter o documento só em memória foi **descartada**: no boot
sem rede o snapshot vem do disco sem documento, então buscar por CPF só funcionaria com sinal — e uma
busca que só funciona com sinal não serve para o campo, que é onde ela foi pedida. Registro em ADR-0090
§3.5 e em `docs/SECURITY.md`.

**Não há nenhuma pergunta aberta.** Q1, Q2, Q3 e Q4 estão decididas, nenhuma é
`[NEEDS CLARIFICATION]`, e o `tasks.md` traz o prompt de execução. A T0.1 👤 continua sendo o gate da
Fase 1, agora como aceite da ADR inteira e já decidida — não como pergunta.

**Q2 — O bairro vale a mudança de API?** Decidido: **sim**, e no mesmo movimento do CNPJ, para não
haver uma segunda mudança de API depois. O usuário nomeou "endereço/bairro/cidade", e o `stop.label`
de hoje tem rua, número, cidade e UF — o bairro fica fora. Se ele achar que bairro não importa, cai
uma coluna do `select` e um campo do snapshot, e nada mais.

**Q3 — Ordenar por relevância?** Decidido: **não**. A ordem das paradas é a ordem da rota; reordenar
o resultado por casamento colocaria a parada 7 antes da 2 e transformaria a busca numa segunda rota.
