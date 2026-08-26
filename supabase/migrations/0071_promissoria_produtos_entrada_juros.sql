-- 0071 — Promissórias detalhadas: produto opcional, entrada, acréscimo/juros e estoque.
-- Compatível com promissórias antigas sem produto.

alter table public.promissorias
  add column if not exists valor_produtos numeric not null default 0,
  add column if not exists entrada_valor numeric not null default 0,
  add column if not exists acrescimo_tipo text,
  add column if not exists acrescimo_valor numeric not null default 0,
  add column if not exists acrescimo_percentual numeric not null default 0;

do $$ begin
  alter table public.promissorias add constraint promissorias_acrescimo_tipo_check
    check (acrescimo_tipo is null or acrescimo_tipo in ('percentual','valor'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.promissorias add constraint promissorias_valores_detalhados_check
    check (valor_produtos >= 0 and entrada_valor >= 0 and acrescimo_valor >= 0 and acrescimo_percentual >= 0);
exception when duplicate_object then null; end $$;

alter table public.promissoria_pagamentos
  add column if not exists tipo text not null default 'parcela';

do $$ begin
  alter table public.promissoria_pagamentos add constraint promissoria_pagamentos_tipo_check
    check (tipo in ('entrada','parcela'));
exception when duplicate_object then null; end $$;

create table if not exists public.promissoria_itens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  promissoria_id uuid not null references public.promissorias(id) on delete cascade,
  produto_id uuid not null references public.produtos(id),
  variacao_id uuid references public.produto_variacoes(id),
  quantidade integer not null default 1 check (quantidade > 0),
  preco_unitario numeric not null check (preco_unitario >= 0),
  created_at timestamptz not null default now()
);

create index if not exists promissoria_itens_org_prom_idx
  on public.promissoria_itens(organization_id, promissoria_id);

alter table public.promissoria_itens enable row level security;

drop policy if exists promissoria_itens_select on public.promissoria_itens;
create policy promissoria_itens_select on public.promissoria_itens
for select to authenticated using (organization_id = public.current_org_id());

drop policy if exists promissoria_itens_insert on public.promissoria_itens;
create policy promissoria_itens_insert on public.promissoria_itens
for insert to authenticated with check (organization_id = public.current_org_id());

drop policy if exists promissoria_itens_update on public.promissoria_itens;
create policy promissoria_itens_update on public.promissoria_itens
for update to authenticated using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id());

drop policy if exists promissoria_itens_delete on public.promissoria_itens;
create policy promissoria_itens_delete on public.promissoria_itens
for delete to authenticated using (organization_id = public.current_org_id());

create table if not exists public.promissoria_operacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  promissoria_id uuid not null references public.promissorias(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

alter table public.promissoria_operacoes enable row level security;

drop policy if exists promissoria_operacoes_select on public.promissoria_operacoes;
create policy promissoria_operacoes_select on public.promissoria_operacoes
for select to authenticated using (organization_id = public.current_org_id());

drop policy if exists promissoria_operacoes_insert on public.promissoria_operacoes;
create policy promissoria_operacoes_insert on public.promissoria_operacoes
for insert to authenticated with check (organization_id = public.current_org_id());

create or replace function public.salvar_promissoria_detalhada(
  p_promissoria_id uuid,
  p_cliente_id uuid,
  p_valor_base numeric,
  p_entrada_valor numeric,
  p_acrescimo_tipo text,
  p_acrescimo_input numeric,
  p_parcelas integer,
  p_data_primeira date,
  p_observacao text,
  p_itens jsonb,
  p_entrada_forma text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_id uuid;
  v_item jsonb;
  v_old record;
  v_prod record;
  v_qtd integer;
  v_preco numeric;
  v_base numeric := 0;
  v_acrescimo numeric := 0;
  v_pct numeric := 0;
  v_total numeric := 0;
  v_entrada numeric := greatest(coalesce(p_entrada_valor, 0), 0);
  v_pago_parcelas numeric := 0;
  v_entrada_antiga numeric := 0;
  v_pago_total numeric := 0;
  v_estoque numeric;
  v_novo_estoque numeric;
begin
  if public.current_papel() not in ('owner','gerente','caixa','financeiro') then
    raise exception 'Seu perfil não tem permissão para salvar promissórias';
  end if;
  if v_org is null then raise exception 'Empresa não identificada'; end if;
  if p_cliente_id is null then raise exception 'Selecione um cliente'; end if;
  if coalesce(p_parcelas,0) <= 0 then raise exception 'Informe a quantidade de parcelas'; end if;
  if p_data_primeira is null then raise exception 'Informe a data da primeira parcela'; end if;
  if p_acrescimo_tipo is not null and p_acrescimo_tipo not in ('percentual','valor') then
    raise exception 'Tipo de acréscimo inválido';
  end if;

  if coalesce(p_idempotency_key,'') <> '' then
    select promissoria_id into v_id
      from public.promissoria_operacoes
     where organization_id=v_org and idempotency_key=p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  if p_promissoria_id is null then
    insert into public.promissorias(
      cliente_id, valor_total, parcelas, status, observacao,
      data_vencimento, data_primeira_parcela, organization_id, user_id
    ) values (
      p_cliente_id, 0, p_parcelas, 'em_aberto', nullif(trim(coalesce(p_observacao,'')),''),
      p_data_primeira, p_data_primeira, v_org, auth.uid()
    ) returning id into v_id;
  else
    select id into v_id from public.promissorias
     where id=p_promissoria_id and organization_id=v_org and status<>'cancelado' for update;
    if v_id is null then raise exception 'Promissória não encontrada ou cancelada'; end if;
  end if;

  select coalesce(sum(valor) filter (where tipo='parcela'),0),
         coalesce(sum(valor) filter (where tipo='entrada'),0),
         coalesce(sum(valor),0)
    into v_pago_parcelas, v_entrada_antiga, v_pago_total
    from public.promissoria_pagamentos where promissoria_id=v_id;

  if v_pago_parcelas > 0.005 and abs(v_entrada-v_entrada_antiga) > 0.005 then
    raise exception 'A entrada não pode ser alterada depois que parcelas já foram recebidas';
  end if;

  -- Restaura os itens antigos antes de aplicar a nova seleção. Tudo ocorre na mesma transação.
  for v_old in
    select produto_id, variacao_id, quantidade
      from public.promissoria_itens
     where promissoria_id=v_id and organization_id=v_org
  loop
    if v_old.variacao_id is not null then
      select estoque into v_estoque from public.produto_variacoes
       where id=v_old.variacao_id and organization_id=v_org for update;
      v_novo_estoque := coalesce(v_estoque,0) + v_old.quantidade;
      update public.produto_variacoes set estoque=v_novo_estoque where id=v_old.variacao_id;
    else
      select estoque into v_estoque from public.produtos
       where id=v_old.produto_id and organization_id=v_org for update;
      v_novo_estoque := coalesce(v_estoque,0) + v_old.quantidade;
      update public.produtos set estoque=v_novo_estoque where id=v_old.produto_id;
    end if;
    insert into public.estoque_movimentacoes(
      produto_id,variacao_id,tipo,quantidade,observacao,motivo,referencia_id,
      organization_id,user_id,quantidade_anterior,quantidade_posterior
    ) values (
      v_old.produto_id,v_old.variacao_id,'entrada',v_old.quantidade,
      'Revisão de item da promissória','Promissória',v_id,v_org,auth.uid(),v_estoque,v_novo_estoque
    );
  end loop;
  delete from public.promissoria_itens where promissoria_id=v_id and organization_id=v_org;

  -- Aplica os itens novos usando sempre o preço atual cadastrado no produto/variação.
  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb))
  loop
    v_qtd := greatest(coalesce((v_item->>'quantidade')::int,1),1);
    if nullif(v_item->>'variacao_id','') is not null then
      select p.id produto_id,pv.id variacao_id,coalesce(pv.preco,p.preco) preco,pv.estoque estoque
        into v_prod
        from public.produto_variacoes pv join public.produtos p on p.id=pv.produto_id
       where pv.id=(v_item->>'variacao_id')::uuid
         and p.id=(v_item->>'produto_id')::uuid
         and pv.organization_id=v_org for update;
    else
      select p.id produto_id,null::uuid variacao_id,p.preco preco,p.estoque::numeric estoque
        into v_prod
        from public.produtos p
       where p.id=(v_item->>'produto_id')::uuid and p.organization_id=v_org for update;
    end if;
    if v_prod.produto_id is null then raise exception 'Produto da promissória não encontrado'; end if;
    if coalesce(v_prod.estoque,0) < v_qtd then raise exception 'Estoque insuficiente para %', v_prod.produto_id; end if;
    v_preco := coalesce(v_prod.preco,0);
    v_novo_estoque := v_prod.estoque-v_qtd;
    if v_prod.variacao_id is not null then
      update public.produto_variacoes set estoque=v_novo_estoque where id=v_prod.variacao_id;
    else
      update public.produtos set estoque=v_novo_estoque where id=v_prod.produto_id;
    end if;
    insert into public.promissoria_itens(organization_id,promissoria_id,produto_id,variacao_id,quantidade,preco_unitario)
    values(v_org,v_id,v_prod.produto_id,v_prod.variacao_id,v_qtd,v_preco);
    insert into public.estoque_movimentacoes(
      produto_id,variacao_id,tipo,quantidade,observacao,motivo,referencia_id,
      organization_id,user_id,quantidade_anterior,quantidade_posterior
    ) values (
      v_prod.produto_id,v_prod.variacao_id,'saida',v_qtd,
      'Produto entregue em promissória','Promissória',v_id,v_org,auth.uid(),v_prod.estoque,v_novo_estoque
    );
    v_base := v_base + v_preco*v_qtd;
  end loop;

  if jsonb_array_length(coalesce(p_itens,'[]'::jsonb))=0 then
    v_base := greatest(coalesce(p_valor_base,0),0);
  end if;
  if v_base <= 0 then raise exception 'Informe um produto ou um valor base válido'; end if;

  if p_acrescimo_tipo='percentual' then
    v_pct := greatest(coalesce(p_acrescimo_input,0),0);
    v_acrescimo := round(v_base*v_pct/100.0,2);
  elsif p_acrescimo_tipo='valor' then
    v_acrescimo := greatest(coalesce(p_acrescimo_input,0),0);
    v_pct := case when v_base>0 then round(v_acrescimo/v_base*100.0,4) else 0 end;
  end if;
  v_total := round(v_base+v_acrescimo,2);
  if v_entrada > v_total then raise exception 'Entrada maior que o valor total'; end if;
  if v_total < v_pago_total-0.005 then raise exception 'O novo total não pode ser menor que o valor já recebido'; end if;

  if v_pago_parcelas <= 0.005 then
    delete from public.promissoria_pagamentos where promissoria_id=v_id and tipo='entrada';
    if v_entrada > 0 then
      insert into public.promissoria_pagamentos(
        organization_id,promissoria_id,valor,data,forma_pagamento,observacao,tipo,idempotency_key
      ) values (
        v_org,v_id,v_entrada,current_date,nullif(p_entrada_forma,''),
        'Entrada da promissória','entrada',
        case when coalesce(p_idempotency_key,'')<>'' then p_idempotency_key||':entrada' else null end
      ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
  end if;

  select coalesce(sum(valor),0) into v_pago_total
    from public.promissoria_pagamentos where promissoria_id=v_id;

  update public.promissorias set
    cliente_id=p_cliente_id,
    valor_produtos=v_base,
    entrada_valor=v_entrada,
    acrescimo_tipo=case when v_acrescimo>0 then p_acrescimo_tipo else null end,
    acrescimo_valor=v_acrescimo,
    acrescimo_percentual=v_pct,
    valor_total=v_total,
    parcelas=p_parcelas,
    data_vencimento=p_data_primeira,
    data_primeira_parcela=p_data_primeira,
    observacao=nullif(trim(coalesce(p_observacao,'')),''),
    status=case when v_pago_total>=v_total-0.005 then 'pago' else 'em_aberto' end,
    updated_at=now()
  where id=v_id and organization_id=v_org;

  if coalesce(p_idempotency_key,'')<>'' then
    insert into public.promissoria_operacoes(organization_id,idempotency_key,promissoria_id)
    values(v_org,p_idempotency_key,v_id)
    on conflict (organization_id,idempotency_key) do nothing;
  end if;

  perform public.log_auditoria(
    'promissoria_salvar','promissorias',v_id,
    jsonb_build_object('valor_produtos',v_base,'entrada',v_entrada,'acrescimo',v_acrescimo,'total',v_total,'parcelas',p_parcelas)
  );
  return v_id;
end;
$$;

revoke all on function public.salvar_promissoria_detalhada(uuid,uuid,numeric,numeric,text,numeric,integer,date,text,jsonb,text,text) from public;
grant execute on function public.salvar_promissoria_detalhada(uuid,uuid,numeric,numeric,text,numeric,integer,date,text,jsonb,text,text) to authenticated;
