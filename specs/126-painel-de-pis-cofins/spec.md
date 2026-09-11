# Feature 126 — Painel de PIS/COFINS em Configurações

## Problema e resultado

`company_tax_settings` (regime federal, `pis_rate`, `cofins_rate`, em **fração**) existe desde a
spec 061 e é lido pela conta da viagem — mas não havia rota nem tela. Sem linha, a parcela
`pis_cofins` sai "regime federal não declarado" em toda viagem, e a margem é mostrada sem os
federais.

Decisão do usuário: **deixar no painel de configuração para adicionar**, com a alíquota sugerida
pelo regime e o contador confirmando. Resultado: `GET`/`PUT`/`DELETE
/company-settings/federal-taxes` e uma aba **Tributos** em Configurações da empresa; depois de
salvar, a linha PIS/COFINS da conta sai com valor.

## Regras

1. **API** — `settings.manage`, escopo `company`; `companyId` sempre do contexto, nunca do corpo.
   Corpo `{ federalRegime, pisRate, cofinsRate }` validado por Zod `.strict()`, alíquotas em
   **fração** com até seis casas. `PUT` substitui (a tabela tem uma linha por empresa), `DELETE`
   volta a "não declarado" (204). Toda escrita grava `audit_logs` com quem, antes e depois;
   `updated_by_user_id` guarda o último autor.
2. **A fração tem teto de sanidade: 20%.** A maior alíquota federal comum aqui é 7,6% (COFINS não
   cumulativa). O teto existe para recusar o erro de unidade — `0.65` (65%) é o que chega quando
   alguém digita o percentual onde se espera a fração, e a conta multiplicaria o imposto por cem. As
   violações voltam **todas de uma vez** em `details[]`.
3. **Simples Nacional grava zero.** No Simples (CRT 1/2) PIS e COFINS estão dentro do DAS: não há
   alíquota própria a descontar da margem. `federalRegime: 'simple'` com alíquota diferente de zero
   é recusado.
4. **Sugestão pelo regime, confirmação do contador** (tela):
   - CRT 1 ou 2 (`company_fiscal_profiles.tax_regime`) → regime `simple`, PIS 0% e COFINS 0%, com a
     explicação de que os dois estão no DAS;
   - CRT 3 → o usuário escolhe **Lucro Presumido** (sugere PIS 0,65% e COFINS 3,00%, cumulativo) ou
     **Lucro Real** (sugere 1,65% e 7,60%, não cumulativo — e a tela avisa que o contador ajusta
     pelos créditos, porque a alíquota efetiva depois dos créditos é menor que a nominal).
     A sugestão preenche, a origem aparece ao lado do campo, e **digitar apaga a marca** — o valor
     gravado é o que a empresa afirma.
5. **A tela mostra percentual e grava fração.** A conversão é textual
   (`fractionPercentage.service.ts`), nunca por `Number`.
6. **Na conta, o federal segue a origem da receita.** A alíquota é cadastro (afirmado); a base é a
   receita. Com a receita **prevista** (regra de frete, antes do CT-e) a parcela sai `estimated`; com
   toda a receita medida, `measured`. Projeção não se apresenta como apuração.

## Legislação conferida

- **Lucro Presumido (cumulativo):** PIS 0,65% — Lei 9.715/1998, art. 8º, I; COFINS 3% — Lei
  9.718/1998, art. 8º.
- **Lucro Real (não cumulativo):** PIS 1,65% — Lei 10.637/2002, art. 2º; COFINS 7,6% — Lei
  10.833/2003, art. 2º; ambos com direito a crédito (art. 3º de cada lei), por isso "o contador
  ajusta".
- ⚠️ Conferido por fontes secundárias que citam os artigos (a leitura direta do planalto.gov.br
  recusou conexão nesta sessão). ⚠️ A CBS (LC 214/2025) substitui PIS/COFINS a partir de 2027; o
  cadastro continua valendo até lá, e a troca é spec própria.

## Decisões

### D1 — A sugestão mora na tela, não na API

A API grava o que a empresa afirma e mais nada: embutir a tabela de alíquotas no servidor faria o
número sugerido parecer regra do produto. A tela tem o CRT (a consulta da empresa já está ligada em
toda aba de Configurações) e a tabela de sugestão como cópia documentada da legislação.

### D2 — Aba própria ("Tributos"), no módulo de configurações

O efeito aparece na conta da viagem, mas o dado é da empresa inteira e ao lado do CRT — o usuário
pediu explicitamente o painel de configuração. Registrado em `SETTINGS_PANEL_PLACEMENT` como
`federalTaxes`, fonte `federalTaxes`, aba `taxes`.

### D3 — Teto em vez de adivinhar a unidade

A API não converte `0.65` em `0.0065`: adivinhar a unidade é o erro que o teto existe para recusar.

## Ordem de deploy

**API primeiro.** O frontend novo chama `/company-settings/federal-taxes`; contra a API antiga a
consulta dá 404 e o painel mostra o erro de carga (nada some calado — o guard não é de lista
fechada sobre um corpo existente). A API nova com o frontend antigo só acrescenta rotas sem
consumidor.

## Medições

Ver `evidence.md`.
