# Spec 244 — O ajudante sem resto: consentimento, foto pendente e diária zero

> 🤖 Modelo: `sonnet` (nenhuma task 🧠 — as decisões estão fechadas aqui)

## Problema

Três restos ficaram registrados como pendência conhecida na 235 e na 243, todos medidos no código:

1. **O ajudante vê um cartão que dá 403.** `DriverProfile.page.tsx:174` monta `DriverLocationConsentCard` sem
   condição. As rotas de consentimento (`me-location.routes.ts`) pedem `trip.report`, inclusive o `GET`; a conta
   só com `trip.read` (ajudante) lê e grava o consentimento com 403.
2. **A pendência de foto de uma conta sem `trip.report` continua listada.** `listPendingProofs` lista as entregas
   que o próprio `driverId` reportou nos últimos 90 dias. Uma pessoa que entregou como motorista e depois ficou só
   com o papel `helper` vê "Fotos pendentes (N)", mas o `POST` do comprovante exige `trip.report` e responde 403;
   o item fica recusado na fila.
3. **A diária zero some na tela e vira `null` ao salvar.** `toTypedAmount` devolve `''` para `0.0000`. Na ficha do
   motorista, editar uma ficha cuja diária de ajudante (ou de motorista) é `0` mostra o campo vazio e **reenvia
   `null`**: apaga um zero deliberado, que é diferente de "sem valor" (para a diária do ajudante, zero é "esta
   pessoa não recebe diária" e vence a diária geral). O painel da diária geral tem o mesmo defeito na leitura.

## Resultado

- O cartão de consentimento some para quem a API recusa; a conta que pode reportar não muda.
- A API só devolve pendências de foto a quem pode reportar.
- O zero é um valor: aparece como `0,00`, é gravado como `0.0000` e não vira `null` numa edição.

## Fora do escopo

- A diária zero em campos de outras telas (custos de veículo, tabela de frete): usam a mesma função, mas o zero
  ali tem outro significado; só os três campos de diária da ficha e a diária geral entram.
- Dar ao ajudante ação de campo (continua acompanhando).
- Mudar a política do consentimento (continua `trip.report`).

## Decisões (padrões — o usuário pode mudar antes da Fase 1)

- **D1 — O cartão se esconde pela resposta da API.** `useLocationConsent` trata `403` na leitura como "não se
  aplica a esta conta": o cartão não renderiza (sem alerta, sem botão). Qualquer outro erro continua como hoje.
  Decidir pela API e não por papel no app mantém a regra num lugar só.
- **D2 — A pendência de foto segue a permissão.** `GET /me/trips/current` devolve `pendingProofs: []` quando o
  contexto não tem `trip.report`; as viagens e o resto da resposta não mudam.
- **D3 — O zero vive.** Um conversor que preserva o zero (`0.0000` → `0,00`) substitui `toTypedAmount` nos campos
  `helperDailyRate` e `dailyAllowanceAmount` da ficha e na diária geral; vazio continua `null`. A função
  compartilhada (`toTypedAmount`) não muda, para não alterar as telas fora do escopo.

## Requisitos funcionais

- **RF-1** `useLocationConsent` expõe que a conta não é elegível quando a leitura responde 403; o `Profile` não
  monta o cartão nesse caso; contrato nos dois sentidos.
- **RF-2** Contrato e integração de `/me/trips/current`: sem `trip.report` → `pendingProofs` vazio, com `trip.report`
  → como hoje.
- **RF-3** Os três campos de diária mostram `0,00` para zero, enviam `0.0000`, e vazio envia `null`; a edição de
  uma ficha com zero não apaga o valor.

## Requisitos não funcionais

- Nenhuma rota nova, nenhuma migration. `companyId` do contexto.
- Texto só em locale; sem estilo inline; contrato afirma comportamento, não texto-fonte.

## Casos extremos e falhas

- Conta com `trip.report` e consentimento ainda não dado: o cartão aparece como hoje.
- Falha de rede na leitura do consentimento: o cartão mostra o erro como hoje (só o 403 esconde).
- Ficha com diária própria `0.0000` e diária geral `120,00`: vale zero (a própria vence), e a tela mostra `0,00`.
- Digitar `0` e `0,0`: ambos gravam `0.0000`.

## Critérios de aceite

1. O ajudante puro abre o Perfil sem o cartão e sem 403 no console.
2. Uma conta sem `trip.report` não recebe `pendingProofs`.
3. Editar a ficha de um ajudante com diária própria zero mantém o zero; a diária geral zero aparece como `0,00`.
4. Gates verdes; revisão de design com prints do Perfil do ajudante e dos campos com `0,00`, vistos pelo usuário
   antes de ir a staging.

## Dúvidas

Nenhuma bloqueante.
