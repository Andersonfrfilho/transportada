# Feature 219 — A ocorrência da nota não sabe o contratante

## Problema e resultado

A spec 218 (RF-B1–B4) deu ao operador exceção de `attachmentMode` de ocorrência por
contratante e por destinatário, com resolução em 3 camadas já pronta no backend
(`listFieldOccurrenceTypes`, RF-B2, `GET .../occurrence-types?contractorId=&recipientTaxId=`). A
própria spec 218 registrou o limite (evidence.md, "Limite registrado"): o snapshot do motorista
(`GET /me/trips/current`) não traz `contractorId`/`recipientTaxId` de cada nota, então o app não
tem o que mandar nesses dois parâmetros — a exceção configurada nunca chega ao motorista, que só
vê o `attachmentMode` geral do tipo. A História P3 do `spec.md` da 218 não é atendida na prática.

Resultado: ao abrir "Ocorrência" numa nota, o motorista vê o `attachmentMode` **efetivo** daquela
nota (geral → contratante do emitente → destinatário, o mais específico vencendo) — a mesma conta
que o operador já vê na tela de verificação (RF-E2) e que o escritório já usa
(`trip-field-office-occurrence.routes.ts`).

## Fora do escopo

- Qualquer mudança de precedência ou nas tabelas de override — já existem (spec 218 RF-B1/RF-D1).
- O "Deu problema" da parada (`DriverNotDeliveredForm`) — ocorrência de **parada**, sem nota e sem
  contratante/destinatário para resolver contra (RF-A5/D4 já deixam isso explícito).
- Tela de verificação do operador (RF-E1/E2) — já existe, fora do app do motorista.

## Histórias priorizadas

### P1 — A exceção de contratante chega ao motorista

**Given** o operador configurou, no tipo "Endereço não encontrado", uma exceção para o contratante
"Distribuidora Alfa" com `attachmentMode: required`
**When** o motorista abre "Ocorrência" numa nota cujo emitente é a Distribuidora Alfa
**Then** o tipo aparece com `required`, mesmo a configuração geral sendo `optional` — o mesmo
resultado que a spec 218 (P3) já prova no backend, agora visível na tela.

### P2 — Destinatário vence contratante, na tela

**Given** contratante com `attachmentMode: off` e destinatário (da mesma nota) com
`attachmentMode: required`
**When** o motorista abre "Ocorrência" nessa nota
**Then** o tipo aparece com `required` — o destinatário vence (spec 218 P4), e a tela mostra o
efetivo, não o geral.

### P3 — Sem contratante/destinatário resolvido, nada muda

**Given** a nota não tem contratante resolvido (emitente sem `contractors` correspondente) nem
destinatário com override
**When** o motorista abre "Ocorrência" nessa nota
**Then** a lista mostra o `attachmentMode` geral do tipo — o comportamento de hoje, byte a byte.

### P4 — Sem rede, a lista geral ainda aparece

**Given** o motorista está offline (ou a chamada por nota falha)
**When** ele abre "Ocorrência"
**Then** a lista aparece com o `attachmentMode` geral (da última carga/cache da spec 157), nunca
vazia por causa da falha da resolução por nota — a resolução por nota é um refinamento, não uma
dependência dura da tela abrir.

## Requisitos funcionais

**RF1** `DriverTripDocument` (backend, `find-current-driver-trip.use-case.ts`) ganha
`contractorId: string | null` e `recipientTaxId: string | null`, opcionais no tipo (não quebrar
fixture antiga que constrói o objeto à mão) — populados por
`DrizzleCurrentDriverTripRepository.toDriverDocument` a partir das colunas que a consulta de
`listDocuments` **já traz** (`contractors.id`, `nfeParticipants.taxId`), hoje consumidas só para
resolver `deliveryProof` e descartadas.

**RF2** `DriverTripDocument` (frontend-driver, cópia por valor) ganha os dois mesmos campos,
opcionais pelo mesmo motivo.

**RF3** `driverTripClient.listOccurrenceTypes` aceita um parâmetro opcional
`{ contractorId?: string | null; recipientTaxId?: string | null }` e manda os dois na query string
de `GET .../occurrence-types` quando presentes — a rota já os aceita (spec 218 T9).

**RF4** `useOccurrenceRegistrationForm` busca, ao montar (uma vez por abertura do formulário), a
lista resolvida por nota quando `document.contractorId`/`document.recipientTaxId` está presente, e
usa o `attachmentMode` dessa resposta para sobrescrever o da lista geral (`params.occurrenceTypes`,
já carregada pela página) — nunca troca a lista inteira, nunca decide precedência: só aplica o
`attachmentMode` que o servidor já resolveu, tipo a tipo. Sem contratante nem destinatário
(P3), ou com a busca falhando (P4), a lista geral segue exatamente como está — sem overlay.

**RF5** `DriverOccurrenceRegistrationForm.component.tsx` não muda: continua lendo `form.types`,
que passa a vir com o `attachmentMode` já corrigido pelo hook.

## Requisitos não funcionais

- Regressão zero: nota sem contratante/destinatário resolvido (a maioria hoje) tem o mesmo
  comportamento de antes da 219, sem chamada extra que mude o resultado.
- A chamada por nota nunca bloqueia a abertura do formulário — a lista geral já habilita a tela; o
  overlay chega depois, quando (e se) a resposta voltar.
- Nenhuma lógica de precedência entra no app (mesma regra da 218 RF-C3/RF-B2): o app só lê o
  `attachmentMode` que o servidor devolveu para aquele `contractorId`/`recipientTaxId`.

## Casos extremos e falhas

- Nota com `contractorId` e sem `recipientTaxId` (ou o contrário): manda só o que tem — a rota já
  aceita um dos dois ausente (RF-B2 da 218).
- Tipo que existe na lista geral mas não vem na resposta por nota (empresa mudou o catálogo entre
  as duas chamadas): mantém o `attachmentMode` da lista geral para esse tipo — nunca remove o tipo
  da lista.

## Critérios de aceite

- Contrato de integração (`me-trip.integration.ts`) prova que o snapshot expõe `contractorId`/
  `recipientTaxId` batendo com o que a spec 218 já resolve para `deliveryProof`.
- Contrato do cliente HTTP prova a query string com os dois parâmetros.
- Contrato de wiring prova que o hook chama `listOccurrenceTypes` com os campos do `document`, e
  que a mescla de `attachmentMode` é uma função pura testável (nunca a lista geral sumindo).
- `bun run check` verde nas duas apps tocadas.

## Dúvidas

Nenhuma — o backend (rota, resolução em 3 camadas) já existe da spec 218; esta spec só fecha o
transporte do dado que falta (RF-B2/T9 registrado como limite conhecido, não como pendência aberta
de decisão).
