-- Integração Shopify por empresa. Tokens nunca são expostos pelo RLS e ficam
-- cifrados pela aplicação antes de chegar ao banco.

create table public.shopify_integracoes (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  shop_domain text not null unique,
  access_token_enc text not null,
  scopes text[] not null default '{}',
  location_gid text,
  location_name text,
  status text not null default 'ativa' check (status in ('ativa','erro','desconectada')),
  sync_vendas boolean not null default true,
  sync_estoque boolean not null default true,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopify_oauth_states (
  state_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shopify_produto_mapeamentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  variacao_id uuid references public.produto_variacoes(id) on delete cascade,
  shopify_product_gid text not null,
  shopify_variant_gid text not null,
  inventory_item_gid text not null,
  location_gid text not null,
  shopify_title text,
  sku text,
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shopify_variant_gid)
);
create unique index shopify_map_nexo_var_uq
  on public.shopify_produto_mapeamentos(organization_id, variacao_id)
  where variacao_id is not null and status = 'ativo';
create unique index shopify_map_nexo_prod_uq
  on public.shopify_produto_mapeamentos(organization_id, produto_id)
  where variacao_id is null and status = 'ativo';

create table public.shopify_pedidos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shopify_order_gid text not null,
  order_number text,
  venda_id uuid references public.vendas(id) on delete set null,
  status text not null default 'importado',
  moeda text,
  aviso text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shopify_order_gid)
);

create table public.shopify_eventos (
  delivery_id text primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  shop_domain text not null,
  topic text not null,
  external_id text,
  status text not null default 'recebido' check (status in ('recebido','processando','concluido','ignorado','erro')),
  tentativas integer not null default 0,
  erro text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.shopify_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  movimentacao_id uuid not null references public.estoque_movimentacoes(id) on delete cascade,
  mapeamento_id uuid not null references public.shopify_produto_mapeamentos(id) on delete cascade,
  quantidade_comparada numeric not null check (quantidade_comparada >= 0),
  quantidade_alvo numeric not null check (quantidade_alvo >= 0),
  status text not null default 'pendente' check (status in ('pendente','processando','concluido','erro')),
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  erro text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (movimentacao_id, mapeamento_id)
);
create index shopify_outbox_pendente_idx
  on public.shopify_sync_outbox(status, proxima_tentativa_em, created_at);

alter table public.shopify_integracoes enable row level security;
alter table public.shopify_oauth_states enable row level security;
alter table public.shopify_produto_mapeamentos enable row level security;
alter table public.shopify_pedidos enable row level security;
alter table public.shopify_eventos enable row level security;
alter table public.shopify_sync_outbox enable row level security;

-- A integração expõe ao painel somente metadados seguros. O token cifrado só é
-- lido pelo service role, por isso não existe policy de SELECT na tabela base.
create or replace function public.shopify_status()
returns table (
  conectado boolean,
  shop_domain text,
  location_name text,
  status text,
  sync_vendas boolean,
  sync_estoque boolean,
  last_sync_at timestamptz,
  last_error text,
  total_mapeados bigint,
  pendencias bigint
)
language sql stable security definer set search_path = public
as $$
  select true, i.shop_domain, i.location_name, i.status, i.sync_vendas,
    i.sync_estoque, i.last_sync_at, i.last_error,
    (select count(*) from public.shopify_produto_mapeamentos m
      where m.organization_id=i.organization_id and m.status='ativo'),
    (select count(*) from public.shopify_sync_outbox o
      where o.organization_id=i.organization_id and o.status in ('pendente','erro'))
  from public.shopify_integracoes i
  where i.organization_id=public.current_org_id()
    and public.current_papel() in ('owner','gerente')
$$;
revoke all on function public.shopify_status() from public, anon;
grant execute on function public.shopify_status() to authenticated;

create policy shopify_map_select on public.shopify_produto_mapeamentos
  for select to authenticated
  using (organization_id=(select public.current_org_id()) and (select public.current_papel()) in ('owner','gerente'));
create policy shopify_map_write on public.shopify_produto_mapeamentos
  for all to authenticated
  using (organization_id=(select public.current_org_id()) and (select public.current_papel())='owner')
  with check (organization_id=(select public.current_org_id()) and (select public.current_papel())='owner');
create policy shopify_pedidos_select on public.shopify_pedidos
  for select to authenticated
  using (organization_id=(select public.current_org_id()) and (select public.current_papel()) in ('owner','gerente','financeiro'));

-- Gera a fila Nexo -> Shopify a partir do ledger. Movimentos originados pela
-- própria Shopify são excluídos para impedir eco e baixa dupla.
create or replace function public.fn_shopify_enfileirar_estoque()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if NEW.quantidade_posterior is null or NEW.tipo like 'shopify_%' then return NEW; end if;
  insert into public.shopify_sync_outbox(
    organization_id,movimentacao_id,mapeamento_id,quantidade_comparada,quantidade_alvo
  )
  select NEW.organization_id,NEW.id,m.id,NEW.quantidade_anterior,NEW.quantidade_posterior
  from public.shopify_produto_mapeamentos m
  join public.shopify_integracoes i on i.organization_id=m.organization_id
  where m.organization_id=NEW.organization_id and m.produto_id=NEW.produto_id
    and m.variacao_id is not distinct from NEW.variacao_id
    and m.status='ativo' and i.status='ativa' and i.sync_estoque;
  return NEW;
end;
$$;
revoke all on function public.fn_shopify_enfileirar_estoque() from public, anon, authenticated;
drop trigger if exists trg_shopify_enfileirar_estoque on public.estoque_movimentacoes;
create trigger trg_shopify_enfileirar_estoque
after insert on public.estoque_movimentacoes
for each row execute function public.fn_shopify_enfileirar_estoque();

-- Importa uma venda paga de modo atômico. Exclusiva do service role: a função
-- recebe a empresa explicitamente, mas nunca fica disponível ao cliente web.
create or replace function public.shopify_importar_pedido(
  p_org uuid,
  p_order_gid text,
  p_order_number text,
  p_processed_at timestamptz,
  p_currency text,
  p_customer jsonb,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount numeric,
  p_gateway text
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  v_existing uuid;
  v_cliente uuid;
  v_venda uuid;
  v_item jsonb;
  v_map record;
  v_qtd integer;
  v_preco numeric;
  v_anterior numeric;
  v_posterior numeric;
  v_forma text;
  v_nome text;
  v_email text;
  v_phone text;
  v_aviso text;
begin
  if auth.role() <> 'service_role' then raise exception 'Acesso negado'; end if;
  select venda_id into v_existing from public.shopify_pedidos
    where organization_id=p_org and shopify_order_gid=p_order_gid;
  if v_existing is not null then return v_existing; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    raise exception 'Pedido sem itens importáveis';
  end if;

  v_nome:=nullif(trim(concat_ws(' ',p_customer->>'first_name',p_customer->>'last_name')),'');
  v_email:=nullif(lower(trim(p_customer->>'email')),'');
  v_phone:=nullif(regexp_replace(coalesce(p_customer->>'phone',''),'\\D','','g'),'');
  select id into v_cliente from public.clientes
    where organization_id=p_org and status='ativo'
      and ((v_email is not null and lower(email)=v_email)
        or (v_phone is not null and regexp_replace(coalesce(telefone,''),'\\D','','g')=v_phone))
    order by created_at limit 1;
  if v_cliente is null and v_nome is not null and (v_email is not null or v_phone is not null) then
    insert into public.clientes(organization_id,nome,email,telefone,observacoes,status)
    values(p_org,v_nome,v_email,v_phone,'Cliente importado da Shopify','ativo') returning id into v_cliente;
  end if;

  v_forma:=case
    when lower(coalesce(p_gateway,'')) like '%pix%' then 'pix'
    when lower(coalesce(p_gateway,'')) like '%cash%' or lower(coalesce(p_gateway,'')) like '%dinheiro%' then 'dinheiro'
    else 'cartao' end;
  insert into public.vendas(
    organization_id,cliente_id,responsavel,forma_pagamento,parcelas,taxa,
    valor_liquido,subtotal,desconto,desconto_pix,total,observacao,status,
    idempotency_key,data_venda,created_at
  ) values (
    p_org,v_cliente,'Shopify',v_forma,1,0,p_total,p_subtotal,
    greatest(0,coalesce(p_discount,0)),0,p_total,
    'Pedido Shopify '||coalesce(p_order_number,p_order_gid),'concluida',
    'shopify-order-'||p_org::text||'-'||p_order_gid,
    (coalesce(p_processed_at,now()) at time zone 'America/Sao_Paulo')::date,
    coalesce(p_processed_at,now())
  ) returning id into v_venda;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qtd:=greatest(1,coalesce((v_item->>'quantity')::integer,1));
    v_preco:=greatest(0,coalesce((v_item->>'unit_price')::numeric,0));
    select * into v_map from public.shopify_produto_mapeamentos
      where organization_id=p_org and shopify_variant_gid=v_item->>'variant_gid' and status='ativo';
    if not found then raise exception 'Variante Shopify sem vínculo no Nexo: %',coalesce(v_item->>'title',v_item->>'variant_gid'); end if;

    insert into public.venda_itens(organization_id,venda_id,produto_id,variacao_id,quantidade,preco_unitario,total_item)
    values(p_org,v_venda,v_map.produto_id,v_map.variacao_id,v_qtd,v_preco,v_qtd*v_preco);
    if v_map.variacao_id is not null then
      select estoque into v_anterior from public.produto_variacoes where id=v_map.variacao_id and organization_id=p_org for update;
      v_posterior:=greatest(0,v_anterior-v_qtd);
      update public.produto_variacoes set estoque=v_posterior where id=v_map.variacao_id;
    else
      select estoque into v_anterior from public.produtos where id=v_map.produto_id and organization_id=p_org for update;
      v_posterior:=greatest(0,v_anterior-v_qtd);
      update public.produtos set estoque=v_posterior where id=v_map.produto_id;
    end if;
    if v_anterior<v_qtd then v_aviso:=concat_ws('; ',v_aviso,'Estoque Nexo menor que o pedido em '||coalesce(v_item->>'title','item')); end if;
    insert into public.estoque_movimentacoes(
      organization_id,produto_id,variacao_id,tipo,quantidade,quantidade_anterior,
      quantidade_posterior,motivo,observacao,referencia_id,idempotency_key
    ) values(
      p_org,v_map.produto_id,v_map.variacao_id,'shopify_venda',least(v_qtd,v_anterior),v_anterior,
      v_posterior,'Venda Shopify',coalesce(p_order_number,p_order_gid),v_venda,
      'shopify-stock-'||p_org::text||'-'||p_order_gid||'-'||v_map.shopify_variant_gid
    );
  end loop;

  insert into public.shopify_pedidos(organization_id,shopify_order_gid,order_number,venda_id,status,moeda,aviso,processed_at)
  values(p_org,p_order_gid,p_order_number,v_venda,case when v_aviso is null then 'importado' else 'importado_com_alerta' end,p_currency,v_aviso,p_processed_at);
  return v_venda;
end;
$$;
revoke all on function public.shopify_importar_pedido(uuid,text,text,timestamptz,text,jsonb,jsonb,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.shopify_importar_pedido(uuid,text,text,timestamptz,text,jsonb,jsonb,numeric,numeric,numeric,text) to service_role;

create or replace function public.shopify_importar_cancelamento(
  p_org uuid,p_order_gid text,p_motivo text default 'Cancelamento na Shopify'
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_venda uuid; v_item record; v_anterior numeric; v_posterior numeric;
begin
  if auth.role()<>'service_role' then raise exception 'Acesso negado'; end if;
  select venda_id into v_venda from public.shopify_pedidos
    where organization_id=p_org and shopify_order_gid=p_order_gid for update;
  if v_venda is null then return null; end if;
  if (select status from public.vendas where id=v_venda)<>'concluida' then return v_venda; end if;
  for v_item in select * from public.venda_itens where venda_id=v_venda and quantidade>0 loop
    if v_item.variacao_id is not null then
      select estoque into v_anterior from public.produto_variacoes where id=v_item.variacao_id for update;
      v_posterior:=v_anterior+v_item.quantidade;
      update public.produto_variacoes set estoque=v_posterior where id=v_item.variacao_id;
    else
      select estoque into v_anterior from public.produtos where id=v_item.produto_id for update;
      v_posterior:=v_anterior+v_item.quantidade;
      update public.produtos set estoque=v_posterior where id=v_item.produto_id;
    end if;
    insert into public.estoque_movimentacoes(
      organization_id,produto_id,variacao_id,tipo,quantidade,quantidade_anterior,
      quantidade_posterior,motivo,observacao,referencia_id,idempotency_key
    ) values(p_org,v_item.produto_id,v_item.variacao_id,'shopify_cancelamento',v_item.quantidade,
      v_anterior,v_posterior,'Cancelamento Shopify',p_motivo,v_venda,
      'shopify-cancel-'||p_org::text||'-'||p_order_gid||'-'||v_item.id::text);
  end loop;
  update public.vendas set status='cancelada',motivo_cancelamento=p_motivo,cancelada_em=now()
    where id=v_venda;
  update public.shopify_pedidos set status='cancelado',updated_at=now()
    where organization_id=p_org and shopify_order_gid=p_order_gid;
  return v_venda;
end;
$$;
revoke all on function public.shopify_importar_cancelamento(uuid,text,text) from public,anon,authenticated;
grant execute on function public.shopify_importar_cancelamento(uuid,text,text) to service_role;

create or replace function public.shopify_importar_reembolso(
  p_org uuid,p_order_gid text,p_refund_gid text,p_items jsonb
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare
  v_venda uuid; v_item jsonb; v_map record; v_vi record; v_qtd numeric;
  v_valor numeric; v_total numeric:=0; v_anterior numeric; v_posterior numeric;
begin
  if auth.role()<>'service_role' then raise exception 'Acesso negado'; end if;
  select venda_id into v_venda from public.shopify_pedidos
    where organization_id=p_org and shopify_order_gid=p_order_gid for update;
  if v_venda is null then return null; end if;
  if exists(select 1 from public.venda_devolucoes where organization_id=p_org and motivo='Shopify refund '||p_refund_gid) then
    return v_venda;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_qtd:=greatest(0,coalesce((v_item->>'quantity')::numeric,0));
    if v_qtd=0 then continue; end if;
    select * into v_map from public.shopify_produto_mapeamentos
      where organization_id=p_org and shopify_variant_gid=v_item->>'variant_gid' and status='ativo';
    if not found then raise exception 'Variante reembolsada sem vínculo no Nexo'; end if;
    select * into v_vi from public.venda_itens
      where venda_id=v_venda and produto_id=v_map.produto_id
        and variacao_id is not distinct from v_map.variacao_id and quantidade>0
      order by created_at limit 1 for update;
    if not found or v_qtd>v_vi.quantidade then raise exception 'Quantidade de reembolso maior que a venda no Nexo'; end if;
    v_valor:=v_qtd*v_vi.preco_unitario; v_total:=v_total+v_valor;
    insert into public.venda_devolucoes(organization_id,venda_id,produto_id,variacao_id,quantidade,valor,custo_unitario,motivo)
    values(p_org,v_venda,v_vi.produto_id,v_vi.variacao_id,v_qtd,v_valor,v_vi.custo_unitario,'Shopify refund '||p_refund_gid);
    update public.venda_itens set quantidade=quantidade-v_qtd,total_item=(quantidade-v_qtd)*preco_unitario where id=v_vi.id;
    if v_vi.variacao_id is not null then
      select estoque into v_anterior from public.produto_variacoes where id=v_vi.variacao_id for update;
      v_posterior:=v_anterior+v_qtd; update public.produto_variacoes set estoque=v_posterior where id=v_vi.variacao_id;
    else
      select estoque into v_anterior from public.produtos where id=v_vi.produto_id for update;
      v_posterior:=v_anterior+v_qtd; update public.produtos set estoque=v_posterior where id=v_vi.produto_id;
    end if;
    insert into public.estoque_movimentacoes(
      organization_id,produto_id,variacao_id,tipo,quantidade,quantidade_anterior,
      quantidade_posterior,motivo,observacao,referencia_id,idempotency_key
    ) values(p_org,v_vi.produto_id,v_vi.variacao_id,'shopify_reembolso',v_qtd,v_anterior,v_posterior,
      'Reembolso Shopify',p_refund_gid,v_venda,
      'shopify-refund-'||p_org::text||'-'||p_refund_gid||'-'||v_vi.id::text);
  end loop;
  if v_total>0 then
    update public.vendas set total=greatest(0,total-v_total),subtotal=greatest(0,subtotal-v_total),updated_at=now() where id=v_venda;
    if not exists(select 1 from public.venda_itens where venda_id=v_venda and quantidade>0) then
      update public.vendas set status='cancelada',motivo_cancelamento='Reembolso integral na Shopify',cancelada_em=now() where id=v_venda;
      update public.shopify_pedidos set status='reembolsado',updated_at=now() where organization_id=p_org and shopify_order_gid=p_order_gid;
    else
      update public.shopify_pedidos set status='reembolso_parcial',updated_at=now() where organization_id=p_org and shopify_order_gid=p_order_gid;
    end if;
  end if;
  return v_venda;
end;
$$;
revoke all on function public.shopify_importar_reembolso(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.shopify_importar_reembolso(uuid,text,text,jsonb) to service_role;

create or replace function public.shopify_definir_estoque(
  p_org uuid,p_variant_gid text,p_available numeric,p_reference text
)
returns void language plpgsql security definer set search_path=public
as $$
declare v_map record; v_anterior numeric; v_alvo numeric:=greatest(0,coalesce(p_available,0));
begin
  if auth.role()<>'service_role' then raise exception 'Acesso negado'; end if;
  select * into v_map from public.shopify_produto_mapeamentos
    where organization_id=p_org and shopify_variant_gid=p_variant_gid and status='ativo';
  if not found then return; end if;
  if v_map.variacao_id is not null then
    select estoque into v_anterior from public.produto_variacoes where id=v_map.variacao_id for update;
    update public.produto_variacoes set estoque=v_alvo where id=v_map.variacao_id;
  else
    select estoque into v_anterior from public.produtos where id=v_map.produto_id for update;
    update public.produtos set estoque=v_alvo where id=v_map.produto_id;
  end if;
  if v_anterior is distinct from v_alvo then
    insert into public.estoque_movimentacoes(
      organization_id,produto_id,variacao_id,tipo,quantidade,quantidade_anterior,
      quantidade_posterior,motivo,observacao,idempotency_key
    ) values(p_org,v_map.produto_id,v_map.variacao_id,'shopify_reconciliacao',abs(v_alvo-v_anterior),
      v_anterior,v_alvo,'Sincronização Shopify',p_reference,
      'shopify-reconcile-'||p_org::text||'-'||p_reference||'-'||p_variant_gid);
  end if;
end;
$$;
revoke all on function public.shopify_definir_estoque(uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.shopify_definir_estoque(uuid,text,numeric,text) to service_role;

grant select,insert,update,delete on public.shopify_integracoes to service_role;
grant select,insert,update,delete on public.shopify_oauth_states to service_role;
grant select,insert,update,delete on public.shopify_produto_mapeamentos to service_role;
grant select,insert,update,delete on public.shopify_pedidos to service_role;
grant select,insert,update,delete on public.shopify_eventos to service_role;
grant select,insert,update,delete on public.shopify_sync_outbox to service_role;
