-- A caixa de papelao que carrega os produtos, e a medida dela (spec 085 G004, ADR-0062).
--
-- ⚠️ A identidade e (empresa, emitente, codigo do produto, unidade comercial). O `cProd` e o codigo
-- DO EMITENTE — sozinho nao identifica nada. E o `uCom` entra na chave porque o mesmo produto em
-- CX12 e CX24 sao DUAS CAIXAS diferentes: medido em 345 NF-e reais, CX12 cobre 151 produtos
-- distintos e CX24 cobre 90, entao o codigo de embalagem diz quantas unidades vao dentro e nunca o
-- tamanho da caixa.
--
-- ⚠️ A linha nasce SEM medida, na importacao. O cadastro se popula do que roda, e medir e preencher
-- o que ja esta la — nunca cadastrar 663 caixas do zero. Medido: 12 caixas cobrem 25% dos volumes,
-- 59 cobrem 50%.
--
-- ⚠️ Milimetro e grama, inteiros: medida em decimal binario acumula erro, pelo mesmo motivo que o
-- dinheiro e centavo. O m3 e DERIVADO das tres medidas, nunca digitado — um m3 solto abriria a porta
-- para discordar das proprias dimensoes.
create table nfe_package_boxes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete restrict on update cascade,
  emitter_tax_id varchar(14) not null,
  product_code text not null,
  commercial_unit text not null,
  description text not null default '',
  -- O GTIN-14 da caixa e alias GLOBAL: medir uma vez serve a qualquer emitente que mande a mesma
  -- caixa. Vem em so 11% delas (75 de 663), entao ele complementa a chave, nunca a substitui.
  units_per_box integer not null default 1,
  carton_gtin varchar(14),
  length_mm integer,
  width_mm integer,
  height_mm integer,
  gross_weight_grams integer,
  measured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nfe_package_boxes_identity_unique
    unique (company_id, emitter_tax_id, product_code, commercial_unit),
  -- Dedo no teclado: caixa de 15 m. A faixa e generosa e ainda assim pega o absurdo.
  constraint nfe_package_boxes_dimensions_check check (
    (length_mm is null or (length_mm > 0 and length_mm <= 6000)) and
    (width_mm is null or (width_mm > 0 and width_mm <= 3000)) and
    (height_mm is null or (height_mm > 0 and height_mm <= 3000)) and
    (gross_weight_grams is null or (gross_weight_grams > 0 and gross_weight_grams <= 2000000))
  ),
  -- Medida pela metade nao mede nada: ou as tres dimensoes, ou nenhuma.
  constraint nfe_package_boxes_dimensions_together_check check (
    (length_mm is null and width_mm is null and height_mm is null) or
    (length_mm is not null and width_mm is not null and height_mm is not null)
  ),
  constraint nfe_package_boxes_units_per_box_check check (units_per_box > 0),
  constraint nfe_package_boxes_measured_at_check check (
    (length_mm is null) = (measured_at is null)
  )
);

-- A fila de medicao ordena pelo que mais roda dentro da empresa; o alias global casa por GTIN.
create index nfe_package_boxes_company_pending_idx
  on nfe_package_boxes (company_id) where measured_at is null;
create index nfe_package_boxes_company_gtin_idx
  on nfe_package_boxes (company_id, carton_gtin) where carton_gtin is not null;
