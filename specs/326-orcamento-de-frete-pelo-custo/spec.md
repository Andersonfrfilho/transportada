# 326 — Orçamento de frete pelo custo da viagem

## Problema e resultado

O frete do sistema era só percentual sobre o valor da nota (`freight_rules`, spec 006): serve para faturar uma nota que já
existe, não para responder "quanto custa levar esta carga". O resultado desta spec é uma **consulta de orçamento** no painel,
que parte do custo da viagem, aplica margem e nunca cobra abaixo do piso mínimo da ANTT. Não grava nada: é consulta.

## Decisões

- **D1 — Custo, não tabela.** `custoViagem = km × (combustível/km + motorista + manutenção + pneus + fixo/km) + pedágio`.
  Combustível/km = preço do diesel ÷ consumo (km/l). Preço do diesel: o informado, senão o efetivo da empresa
  (ajuste manual ou ANP, `resolveEffectiveFuelPrices`), senão `422 FREIGHT_QUOTE_FUEL_PRICE_MISSING` — nunca um chute.
- **D2 — Ocupação rateia o custo.** `custoDoEmbarque = custoViagem × min(1, parteDoVeículo ÷ ocupaçãoEsperada)`. Veículo cheio
  paga a viagem inteira, nunca mais.
- **D3 — Margem sobre o preço.** `frete = custoDoEmbarque ÷ (1 − margem)`; margem de 100% é recusada (divisão por zero).
- **D4 — Piso da ANTT.** `piso = km × CCD + CC` (Res. ANTT 6.084/2026, Anexo II, em vigor desde 17/07/2026; fórmula no Art. 5 da
  6.076/2026). Tabelas A e C (lotação; alto desempenho), doze tipos de carga, eixos 2–7 e 9; eixo ausente usa o vizinho
  (menor primeiro, Art. 5 §5). **O piso é lei: não é editável pela tela**; muda por PR quando a ANTT publicar tabela nova.
  Tabelas B e D (só unidade de tração) ficam fora da primeira versão. A empresa pode desligar a aplicação do piso.
- **D5 — Frete-valor e GRIS por cima.** `total = frete + valorDaCarga × adValorem + valorDaCarga × GRIS`. O piso compara com o
  frete, não com os adicionais de risco.
- **D6 — Parâmetros por empresa** em `company_freight_quote_settings` (uma linha por empresa; sem linha vale
  `FREIGHT_QUOTE_DEFAULTS`). `PUT/DELETE` exigem `settings.manage` e deixam trilha em `audit_logs`; `GET` e o cálculo pedem
  `freight.simulate`. Cada valor inicial tem o porquê escrito na tela.
- **D7 — Aritmética** em `bigint` de seis casas, meio para cima; nunca float binário. Saída com quatro casas.

## Valores iniciais (ponto de partida de mercado, caminhão de 3 eixos em carga geral)

| Parâmetro            | Inicial              | Porquê                                      |
| -------------------- | -------------------- | ------------------------------------------- |
| Margem sobre o preço | 15%                  | transporte rodoviário opera entre 10% e 20% |
| Ocupação esperada    | 85%                  | rateia o custo da viagem entre os embarques |
| Motorista            | R$ 0,90/km           | salário, encargos e diárias ÷ km rodados    |
| Manutenção           | R$ 0,60/km           | preventiva e corretiva                      |
| Pneus                | R$ 0,40/km           | pneus e recapagem                           |
| Custos fixos         | R$ 0,80/km           | depreciação, IPVA, seguro e rastreador      |
| Frete-valor          | 0,30% da carga       | mercado cobra de 0,1% a 0,5%                |
| GRIS                 | 0,20% da carga       | de 0,1% a 0,3%, mais em carga visada        |
| Consumo              | referência por eixos | 4,5 km/l (2 eixos) a 1,9 km/l (9 eixos)     |

⚠️ Não são dados da empresa. A empresa troca cada um pelo número real.

## Fora do escopo

Distância e pedágio automáticos pela rota (a tela recebe os dois); orçamento por WhatsApp ou portal do cliente; gravar o
orçamento aceito; tabelas B e D da ANTT; módulo de coleta.

## Critérios de aceite

- CA01: 500 km, 5 eixos, carga geral, diesel R$ 6, padrões: custo 2.550, preço 3.000, piso 3.993,46, total 4.493,46.
- CA02: sem linha, `GET` devolve os valores iniciais e a fonte da ANTT (não 404).
- CA03: sem preço de diesel, `422`; parâmetro fora de faixa, `400`.
- CA04: a empresa vem do contexto; `companyId` no corpo é recusado.
- CA05: tela com rótulo em cima, campos na altura padrão, prints claro/escuro em desktop e celular.
