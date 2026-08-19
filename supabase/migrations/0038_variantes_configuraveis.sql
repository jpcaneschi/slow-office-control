-- ─────────────────────────────────────────────────────────────────────────────
-- Correção final P0 — #5 Variantes verdadeiramente configuráveis
--
-- Problema: produto_variacoes tinha colunas FIXAS `tamanho`/`cor` (0015), o que
-- forçava a grade a ser sempre "tamanho + cor", tornava "Cor" praticamente
-- obrigatória e não atendia calçados (numeração), eletrônicos (voltagem), etc.
--
-- Esta migration torna as variações configuráveis por produto SEM perder dados:
--   • produtos.marca  → marca deixa de ser "variante" e vira campo do produto.
--   • produto_opcoes  → definição das opções de cada produto (nome/tipo/valores/
--     obrigatório/ordem). Ex.: "Tamanho" (lista P/M/G), "Numeração" (numero),
--     "Voltagem" (numero_unidade 110/220), "Gravação" (texto livre).
--   • produto_variacoes ganha `atributos jsonb` (a combinação escolhida, ex.:
--     {"Tamanho":"P","Cor":"Off White"}) e `codigo_barras`. As colunas legadas
--     `tamanho`/`cor` ficam para trás como compatibilidade — o novo modelo lê
--     `atributos`, mas o front tem fallback para linhas ainda não migradas.
--   • Unicidade: combinação única por produto; SKU e código de barras únicos por
--     organização quando preenchidos.
--
-- Backfill ADITIVO (não reseta tabela nem estoque): para cada produto com grade,
-- cria as opções "Tamanho"/"Cor" só onde havia valor e preenche `atributos` de
-- cada variação a partir de `tamanho`/`cor`. O `estoque` de cada variação é
-- preservado (nunca é tocado).
--
-- Segurança: organization_id + RLS + índices (mesmo padrão de 0015/0017).
-- Idempotente (roda 2x sem erro) e reversível.
--
-- Como reverter:
--   drop table if exists public.produto_opcoes;
--   alter table public.produto_variacoes drop column if exists atributos;
--   alter table public.produto_variacoes drop column if exists codigo_barras;
--   alter table public.produtos drop column if exists marca;
--   (as colunas tamanho/cor e o estoque nunca foram removidos)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Marca vira campo do produto (não é mais variante).
alter table public.produtos
  add column if not exists marca text;

-- 2) Definição das opções configuráveis por produto.
create table if not exists public.produto_opcoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  produto_id uuid not null references public.produtos (id) on delete cascade,
  nome text not null,
  tipo text not null default 'lista'
    check (tipo in ('lista', 'texto', 'numero', 'numero_unidade')),
  unidade text,                                   -- só p/ numero_unidade (ex.: "V", "ml")
  obrigatorio boolean not null default true,
  ordem integer not null default 0,
  valores_permitidos jsonb not null default '[]'::jsonb,   -- lista de strings (tipo=lista)
  created_at timestamptz not null default now()
);

create index if not exists produto_opcoes_produto_idx
  on public.produto_opcoes (produto_id);
create index if not exists produto_opcoes_org_idx
  on public.produto_opcoes (organization_id);
-- Um nome de opção por produto (case-insensitive): não existir "Cor" e "cor".
create unique index if not exists produto_opcoes_produto_nome_uidx
  on public.produto_opcoes (produto_id, lower(nome));

alter table public.produto_opcoes enable row level security;
drop policy if exists "org_isolation" on public.produto_opcoes;
create policy "org_isolation" on public.produto_opcoes for all to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));

-- 3) A variação passa a guardar a combinação escolhida + código de barras.
alter table public.produto_variacoes
  add column if not exists atributos jsonb not null default '{}'::jsonb;
alter table public.produto_variacoes
  add column if not exists codigo_barras text;

-- 4) Unicidades.
-- 4a) Combinação única por produto (ignora variações sem atributos / legadas vazias).
create unique index if not exists produto_variacoes_combo_uidx
  on public.produto_variacoes (produto_id, atributos)
  where atributos <> '{}'::jsonb;
-- 4b) SKU único por organização quando preenchido.
create unique index if not exists produto_variacoes_sku_org_uidx
  on public.produto_variacoes (organization_id, sku)
  where sku is not null and sku <> '';
-- 4c) Código de barras único por organização quando preenchido.
create unique index if not exists produto_variacoes_barras_org_uidx
  on public.produto_variacoes (organization_id, codigo_barras)
  where codigo_barras is not null and codigo_barras <> '';

-- 5) Backfill das OPÇÕES a partir das colunas legadas tamanho/cor.
--    Cria "Tamanho"/"Cor" só onde havia valor; obrigatório = todas as variações
--    do produto tinham aquele campo preenchido. Não recria se já existir.
insert into public.produto_opcoes
  (organization_id, produto_id, nome, tipo, obrigatorio, ordem, valores_permitidos)
select g.organization_id, g.produto_id, 'Tamanho', 'lista', g.todos_tem, 0, g.valores
from (
  select pv.organization_id, pv.produto_id,
    bool_and(pv.tamanho is not null and pv.tamanho <> '') as todos_tem,
    count(*) filter (where pv.tamanho is not null and pv.tamanho <> '') as n_com_valor,
    coalesce(
      jsonb_agg(distinct pv.tamanho) filter (where pv.tamanho is not null and pv.tamanho <> ''),
      '[]'::jsonb
    ) as valores
  from public.produto_variacoes pv
  group by pv.organization_id, pv.produto_id
) g
where g.n_com_valor > 0
  and not exists (
    select 1 from public.produto_opcoes po
    where po.produto_id = g.produto_id and lower(po.nome) = 'tamanho'
  );

insert into public.produto_opcoes
  (organization_id, produto_id, nome, tipo, obrigatorio, ordem, valores_permitidos)
select g.organization_id, g.produto_id, 'Cor', 'lista', g.todos_tem, 1, g.valores
from (
  select pv.organization_id, pv.produto_id,
    bool_and(pv.cor is not null and pv.cor <> '') as todos_tem,
    count(*) filter (where pv.cor is not null and pv.cor <> '') as n_com_valor,
    coalesce(
      jsonb_agg(distinct pv.cor) filter (where pv.cor is not null and pv.cor <> ''),
      '[]'::jsonb
    ) as valores
  from public.produto_variacoes pv
  group by pv.organization_id, pv.produto_id
) g
where g.n_com_valor > 0
  and not exists (
    select 1 from public.produto_opcoes po
    where po.produto_id = g.produto_id and lower(po.nome) = 'cor'
  );

-- 6) Backfill dos ATRIBUTOS de cada variação (só as ainda vazias — idempotente).
--    Estoque, preço, custo e sku permanecem intocados.
update public.produto_variacoes pv
set atributos =
      '{}'::jsonb
      || case when pv.tamanho is not null and pv.tamanho <> ''
              then jsonb_build_object('Tamanho', pv.tamanho) else '{}'::jsonb end
      || case when pv.cor is not null and pv.cor <> ''
              then jsonb_build_object('Cor', pv.cor) else '{}'::jsonb end
where (pv.atributos is null or pv.atributos = '{}'::jsonb)
  and ((pv.tamanho is not null and pv.tamanho <> '')
       or (pv.cor is not null and pv.cor <> ''));
