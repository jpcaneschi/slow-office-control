-- 0071 — Promissórias detalhadas: produto opcional, entrada, acréscimo/juros e estoque.
-- Mantém compatibilidade com promissórias legadas sem produto.

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
  created_at timestamptz not null default now(),
  unique (promissoria_id, produto_id, variacao_id)
);

create index if not exists promissoria_itens_org_prom_idx
  on public.promissoria_itens(organization_id, promissoria_id);

alter table public.promissoria_itens enable row level security;

drop policy if exists promissoria_itens_tenant_select on public.promissoria_itens;
create policy promissoria_itens_tenant_select on public.promissoria_itens
for select to authenticated using (organization_id = public.current_org_id());

drop policy if exists promissoria_itens_tenant_insert on public.promissoria_itens;
create policy promissoria_itens_tenant_insert on public.promissoria_itens
for insert to authenticated with check (organization_id = public.current_org_id());

drop policy if exists promissoria_itens_tenant_update on public.promissoria_itens;
create policy promissoria_itens_tenant_update on public.promissoria_itens
for update to authenticated using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id());

drop policy if exists promissoria_itens_tenant_delete on public.promissoria_itens;
create policy promissoria_itens_tenant_delete on public.promissoria_itens
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

drop policy if exists promissoria_operacoes_tenant_select on public.promissoria_operacoes;
create policy promissoria_operacoes_tenant_select on public.promissoria_operacoes
for select to authenticated using (organization_id = public.current_org_id());

drop policy if exists promissoria_operacoes_tenant_insert on public.promissoria_operacoes;
create policy promissoria_operacoes_tenant_insert on public.promissoria_operacoes
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
  v_old_qtd integer;
  v_new_qtd integer;
  v_delta integer;
  v_anterior numeric;
  v_posterior numeric;
  v_base numeric := 0;
  v_acrescimo numeric := 0;
  v_pct numeric := 0;
  v_total numeric := 0;
  v_entrada numeric := greatest(coalesce(p_entrada_valor,0),0);
  v_pago_parcelas numeric := 0;
  v_entrada_antiga numeric := 0;
  v_total_pago numeric := 0;
  v_existente record;
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
    select o.promissoria_id into v_id
      from public.promissoria_operacoes o
     where o.organization_id=v_org and o.idempotency_key=p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  if p_promissoria_id is not null then
    select * into v_existente from public.promissorias
     where id=p_promissoria_id and organization_id=v_org for update;
    if not found then raise exception 'Promissória não encontrada nesta empresa'; end if;
    if v_existente.status in ('cancelado','pago') then
      raise exception 'Promissória % não pode ser editada', v_existente.status;
    end if;
    v_id := p_promissoria_id;

    select coalesce(sum(valor) filter (where tipo='parcela'),0),
           coalesce(sum(valor) filter (where tipo='entrada'),0)
      into v_pago_parcelas, v_entrada_antiga
      from public.promissoria_pagamentos where promissoria_id=v_id;
    if v_pago_parcelas > 0.005 and abs(v_entrada-v_entrada_antiga) > 0.005 then
      raise exception 'A entrada não pode ser alterada depois que parcelas já foram recebidas';
    end if;
  else
    insert into public.promissorias(
      cliente_id, valor_total, parcelas, status, observacao, data_vencimento,
      data_primeira_parcela, organization_id, user_id
    ) values (
      p_cliente_id, 0, p_parcelas, 'em_aberto', nullif(trim(coalesce(p_observacao,'')),''),
      p_data_primeira, p_data_primeira, v_org, auth.uid()
    ) returning id into v_id;
  end if;

  -- Ajusta estoque apenas pela diferença entre os itens antigos e os novos.
  for v_old in
    select produto_id, variacao_id, sum(quantidade)::int quantidade
      from public.promissoria_itens
     where promissoria_id=v_id and organization_id=v_org
     group by produto_id, variacao_id
  loop
    select coalesce(sum((x->>'quantidade')::int),0)::int into v_new_qtd
      from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) x
     where x->>'produto_id'=v_old.produto_id::text
       and coalesce(x->>'variacao_id','')=coalesce(v_old.variacao_id::text,'');
    v_delta := v_new_qtd - v_old.quantidade;
    if v_delta <> 0 then
      if v_old.variacao_id is not null then
        select estoque into v_anterior from public.produto_variacoes
         where id=v_old.variacao_id and organization_id=v_org for update;
        if v_anterior is null then raise exception 'Variação não encontrada'; end if;
        v_posterior := v_anterior - v_delta;
        if v_posterior < 0 then raise exception 'Estoque insuficiente para a variação selecionada'; end if;
        update public.produto_variacoes set estoque=v_posterior where id=v_old.variacao_id;
      else
        select estoque into v_anterior from public.produtos
         where id=v_old.produto_id and organization_id=v_org for update;
        if v_anterior is null then raise exception 'Produto não encontrado'; end if;
        v_posterior := v_anterior - v_delta;
        if v_posterior < 0 then raise exception 'Estoque insuficiente para o produto selecionado'; end if;
        update public.produtos set estoque=v_posterior where id=v_old.produto_id;
      end if;
      insert into public.estoque_movimentacoes(
        produto_id, variacao_id, tipo, quantidade, observacao, motivo, referencia_id,
        organization_id, user_id, quantidade_anterior, quantidade_posterior
      ) values (
        v_old.produto_id, v_old.variacao_id,
        case when v_delta>0 then 'saida' else 'entrada' end,
        abs(v_delta), 'Edição de promissória', 'Promissória', v_id,
        v_org, auth.uid(), v_anterior, v_posterior
      );
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb))
  loop
    select coalesce(sum(quantidade),0)::int into v_old_qtd
      from public.promissoria_itens
     where promissoria_id=v_id and organization_id=v_org
       and produto_id=(v_item->>'produto_id')::uuid
       and variacao_id is not distinct from nullif(v_item->>'variacao_id','')::uuid;
    v_new_qtd := greatest(coalesce((v_item->>'quantidade')::int,1),1);
    if v_old_qtd=0 then
      v_delta := v_new_qtd;
      if nullif(v_item->>'variacao_id','') is not null then
        select pv.estoque, coalesce(pv.preco,p.preco) preco
          into v_anterior, v_base
          from public.produto_variacoes pv join public.produtos p on p.id=pv.produto_id
         where pv.id=(v_item->>'variacao_id')::uuid
           and pv.produto_id=(v_item->>'produto_id')::uuid
           and pv.organization_id=v_org for update;
        if v_anterior is null then raise exception 'Variação não encontrada'; end if;
        v_posterior := v_anterior-v_delta;
        if v_posterior<0 then raise exception 'Estoque insuficiente para a variação selecionada'; end if;
        update public.produto_variacoes set estoque=v_posterior where id=(v_item->>'variacao_id')::uuid;
      else
        select estoque, preco into v_anterior, v_base from public.produtos
         where id=(v_item->>'produto_id')::uuid and organization_id=v_org for update;
        if v_anterior is null then raise exception 'Produto não encontrado'; end if;
        v_posterior := v_anterior-v_delta;
        if v_posterior<0 then raise exception 'Estoque insuficiente para o produto selecionado'; end if;
        update public.produtos set estoque=v_posterior where id=(v_item->>'produto_id')::uuid;
      end if;
      insert into public.estoque_movimentacoes(
        produto_id, variacao_id, tipo, quantidade, observacao, motivo, referencia_id,
        organization_id, user_id, quantidade_anterior, quantidade_posterior
      ) values (
        (v_item->>'produto_id')::uuid, nullif(v_item->>'variacao_id','')::uuid,
        'saida',v_delta,'Produto entregue em promissória','Promissória',v_id,
        v_org,auth.uid(),v_anterior,v_posterior
      );
    end if;
  end loop;

  delete from public.promissoria_itens where promissoria_id=v_id and organization_id=v_org;
  v_base := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb))
  loop
    if nullif(v_item->>'variacao_id','') is not null then
      select coalesce(pv.preco,p.preco) into v_prod
        from public.produto_variacoes pv join public.produtos p on p.id=pv.produto_id
       where pv.id=(v_item->>'variacao_id')::uuid and pv.produto_id=(v_item->>'produto_id')::uuid and pv.organization_id=v_org;
    else
      select p.preco into v_prod from public.produtos p
       where p.id=(v_item->>'produto_id')::uuid and p.organization_id=v_org;
    end if;
    if v_prod is null then raise exception 'Produto da promissória não encontrado'; end if;
    v_new_qtd := greatest(coalesce((v_item->>'quantidade')::int,1),1);
    insert into public.promissoria_itens(organization_id,promissoria_id,produto_id,variacao_id,quantidade,preco_unitario)
    values(v_org,v_id,(v_item->>'produto_id')::uuid,nullif(v_item->>'variacao_id','')::uuid,v_new_qtd,(v_prod).preco);
    v_base := v_base + (v_prod).preco*v_new_qtd;
  end loop;

  if jsonb_array_length(coalesce(p_itens,'[]'::jsonb))=0 then
    v_base := greatest(coalesce(p_valor_base,0),0);
  end if;
  if v_base<=0 then raise exception 'Informe um produto ou um valor base válido'; end if;

  if p_acrescimo_tipo='percentual' then
    v_pct := greatest(coalesce(p_acrescimo_input,0),0);
    v_acrescimo := round(v_base*v_pct/100.0,2);
  elsif p_acrescimo_tipo='valor' then
    v_acrescimo := greatest(coalesce(p_acrescimo_input,0),0);
    v_pct := case when v_base>0 then round(v_acrescimo/v_base*100.0,4) else 0 end;
  else
    v_acrescimo := 0; v_pct := 0;
  end if;
  v_total := round(v_base+v_acrescimo,2);
  if v_entrada>v_total then raise exception 'Entrada maior que o valor total'; end if;

  select coalesce(sum(valor),0) into v_total_pago from public.promissoria_pagamentos where promissoria_id=v_id;
  if v_total < v_total_pago - 0.005 then raise exception 'O novo total não pode ser menor que o valor já recebido'; end if;

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
    status=case when v_total_paid >= v_total-0.005 then 'pago' else 'em_aberto' end,
    updated_at=now()
  where id=v_id and organization_id=v_org;

  if v_pago_parcelas<=0.005 then
    delete from public.promissoria_pagamentos where promissoria_id=v_id and tipo='entrada';
    if v_entrada>0 then
      insert into public.promissoria_pagamentos(
        organization_id,promissoria_id,valor,data,forma_pagamento,observacao,tipo,idempotency_key
      ) values(
        v_org,v_id,v_entrada,current_date,nullif(p_entrada_forma,''),'Entrada da promissória','entrada',
        case when coalesce(p_idempotency_key,'')<>'' then p_idempotency_key||':entrada' else null end
      ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
  end if;

  if coalesce(p_idempotency_key,'')<>'' then
    insert into public.promissoria_operacoes(organization_id,idempotency_key,promissoria_id)
    values(v_org,p_idempotency_key,v_id) on conflict (organization_id,idempotency_key) do nothing;
  end if;

  perform public.log_auditoria('promissoria_salvar','promissorias',v_id,
    jsonb_build_object('valor_produtos',v_base,'entrada',v_entrada,'acrescimo',v_acrescimo,'total',v_total,'parcelas',p_parcelas));
  return v_id;
end;
$$;

revoke all on function public.salvar_promissoria_detalhada(uuid,uuid,numeric,numeric,text,numeric,integer,date,text,jsonb,text,text) from public;
grant execute on function public.salvar_promissoria_detalhada(uuid,uuid,numeric,numeric,text,numeric,integer,date,text,jsonb,text,text) to authenticated;

-- Vendas no período passa a representar dinheiro de vendas efetivamente recebido:
-- vendas à vista/entrada + recebimentos de promissórias. Serviços ficam separados.
create or replace function public.resumo_operacao_periodo(p_inicio date,p_fim date)
returns table(
  vendas_periodo numeric,
  entradas_vendas numeric,
  recebimentos_promissorias numeric,
  receita_servicos numeric,
  entradas_recebidas numeric,
  despesas_pagas numeric,
  movimentacao_periodo numeric
)
language plpgsql stable set search_path=public
as $$
declare
  v_org uuid:=public.current_org_id(); v_inicio date:=coalesce(p_inicio,current_date); v_fim date:=coalesce(p_fim,coalesce(p_inicio,current_date)); v_fx date;
  v_entradas numeric:=0; v_prom numeric:=0; v_serv numeric:=0; v_desp numeric:=0;
begin
  if v_fim<v_inicio then raise exception 'A data final não pode ser anterior à data inicial'; end if;
  v_fx:=v_fim+1;
  select coalesce(sum(case when v.forma_pagamento='promissoria' then 0 when v.forma_pagamento='misto' then greatest(0,least(v.total,coalesce(v.valor_recebido,0))) else v.total end),0)
    into v_entradas from public.vendas v where v.organization_id=v_org and v.status='concluida' and v.created_at>=v_inicio::timestamptz and v.created_at<v_fx::timestamptz;
  select coalesce(sum(pp.valor),0) into v_prom from public.promissoria_pagamentos pp join public.promissorias p on p.id=pp.promissoria_id
   where p.organization_id=v_org and p.status<>'cancelado' and pp.data>=v_inicio and pp.data<v_fx;
  select coalesce(sum(a.valor*coalesce(a.percentual_loja,0)/100.0),0) into v_serv from public.atendimentos_servico a
   where a.organization_id=v_org and a.data>=v_inicio and a.data<v_fx;
  select coalesce(sum(d.valor),0) into v_desp from public.despesas d where d.organization_id=v_org and d.status='pago' and coalesce(d.data_pagamento,d.data)>=v_inicio and coalesce(d.data_pagamento,d.data)<v_fx;
  v_desp:=v_desp+coalesce((select sum(p.valor_liquido) from public.pagamentos_funcionario p where p.organization_id=v_org and p.data_pagamento>=v_inicio and p.data_pagamento<v_fx),0)
                +coalesce((select sum(v.valor) from public.vales v where v.organization_id=v_org and v.data>=v_inicio and v.data<v_fx),0);
  vendas_periodo:=v_entradas+v_prom;
  entradas_vendas:=v_entradas;
  recebimentos_promissorias:=v_prom;
  receita_servicos:=v_serv;
  entradas_recebidas:=v_entradas+v_prom+v_serv;
  despesas_pagas:=v_desp;
  movimentacao_periodo:=entradas_recebidas+despesas_pagas;
  return next;
end;
$$;

revoke all on function public.resumo_operacao_periodo(date,date) from public;
grant execute on function public.resumo_operacao_periodo(date,date) to authenticated;

-- Agenda: entrada não quita a primeira parcela; ela reduz o saldo parcelado antes do cronograma.
create or replace function public.agenda_promissorias_mes(p_competencia date default current_date)
returns table(id text,data date,tipo text,titulo text,detalhe text,valor numeric,status text,href text)
language sql security invoker stable set search_path=public
as $$
with x as (
  select public.current_org_id() org,date_trunc('month',coalesce(p_competencia,current_date))::date ini,
         (date_trunc('month',coalesce(p_competencia,current_date))+interval '1 month')::date fim
), b as (
  select p.id,p.parcelas,p.status,c.nome cliente,coalesce(p.data_primeira_parcela,p.data_vencimento) primeira,
         greatest(p.valor_total-coalesce(p.entrada_valor,0),0) saldo_inicial,
         coalesce((select sum(pp.valor) from public.promissoria_pagamentos pp where pp.promissoria_id=p.id and pp.tipo='parcela'),0) pago_parcelas,
         coalesce((select string_agg(pi.quantidade::text||'x '||pr.nome,' · ') from public.promissoria_itens pi join public.produtos pr on pr.id=pi.produto_id where pi.promissoria_id=p.id),'Sem produto vinculado') produtos
    from public.promissorias p join x on x.org=p.organization_id left join public.clientes c on c.id=p.cliente_id
   where p.status<>'cancelado' and coalesce(p.data_primeira_parcela,p.data_vencimento) is not null
), ps as (
  select b.*,g.n,
    (date_trunc('month',b.primeira::timestamp+(g.n-1)*interval '1 month')+(least(extract(day from b.primeira)::int,extract(day from(date_trunc('month',b.primeira::timestamp+(g.n-1)*interval '1 month')+interval '1 month - 1 day'))::int)-1)*interval '1 day')::date venc,
    (floor(b.saldo_inicial*100/b.parcelas)+case when g.n<=mod(round(b.saldo_inicial*100)::int,b.parcelas) then 1 else 0 end)/100.0 parcela_valor
  from b cross join lateral generate_series(1,b.parcelas) g(n)
), pc as (
 select ps.*,coalesce(sum(parcela_valor) over(partition by id order by n rows between unbounded preceding and 1 preceding),0) anteriores from ps
)
select 'prom-'||id::text||'-'||n::text,venc,'promissoria',coalesce(cliente,'Cliente')||' • parcela '||n||'/'||parcelas,
       produtos||' · a receber',greatest(parcela_valor-least(parcela_valor,greatest(pago_parcelas-anteriores,0)),0),
       case when greatest(parcela_valor-least(parcela_valor,greatest(pago_parcelas-anteriores,0)),0)<=0.009 then 'pago'
            when greatest(pago_parcelas-anteriores,0)>0 then 'parcial' when venc<current_date then 'atrasado' else 'pendente' end,
       '/dashboard/promissorias'
from pc join x on venc>=x.ini and venc<x.fim;
$$;

revoke all on function public.agenda_promissorias_mes(date) from public;
grant execute on function public.agenda_promissorias_mes(date) to authenticated;
