-- Convite de equipe é vinculado ao e-mail confirmado e à loja existente.
-- A única elevação nova é o aceite atômico de membership + aprovação: o
-- convidado não tem acesso direto de escrita nessas tabelas administrativas.
create or replace function public.criar_convite_equipe(p_email text,p_papel text default 'caixa')
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_email text:=lower(trim(p_email)); v_id uuid; v_org uuid:=public.current_org_id();
begin
 if auth.uid() is null or public.current_papel()<>'owner' or v_org is null then raise exception 'Somente o dono da loja pode convidar'; end if;
 if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Informe um e-mail válido'; end if;
 if p_papel is null or p_papel not in ('gerente','caixa','financeiro') then raise exception 'Escolha Gerente, Caixa ou Financeiro'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||v_email,0));
 if exists(select 1 from public.organization_members where organization_id=v_org and lower(email)=v_email) then raise exception 'Esse e-mail já faz parte da equipe'; end if;
 select id into v_id from public.organization_invites where organization_id=v_org and lower(email)=v_email and status='pendente' order by created_at desc limit 1 for update;
 if v_id is not null then
  update public.organization_invites set papel=p_papel,expires_at=now()+interval '7 days' where id=v_id;
 else
  insert into public.organization_invites(email,papel,status) values(v_email,p_papel,'pendente') returning id into v_id;
 end if;
 perform public.log_auditoria('convite_equipe_criado','organization_invites',v_id,jsonb_build_object('papel',p_papel));
 return v_id;
end $$;
revoke all on function public.criar_convite_equipe(text,text) from public,anon;
grant execute on function public.criar_convite_equipe(text,text) to authenticated;

-- Sem UPDATE do convite pelo destinatário: não pode trocar papel ou organização.
drop policy if exists invites_convidado_update on public.organization_invites;
create or replace function public.aceitar_convite_equipe(p_convite_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_email text; v_confirmado timestamptz; v_inv public.organization_invites%rowtype; v_org uuid; v_dono uuid; v_qtd int;
begin
 if v_user is null then raise exception 'Entre na sua conta para aceitar o convite'; end if;
 select lower(email),email_confirmed_at into v_email,v_confirmado from auth.users where id=v_user;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 select organization_id into v_org from public.organization_members where user_id=v_user order by created_at limit 1;
 -- Logins normais de membros existentes nunca trocam de empresa por convite.
 if p_convite_id is null and v_org is not null then return null; end if;
 if p_convite_id is null then
  select count(*) into v_qtd from public.organization_invites where lower(email)=v_email and status='pendente' and (expires_at is null or expires_at>now());
  if v_qtd=0 then return null; end if;
  if v_qtd>1 then raise exception 'Há mais de um convite. Abra o link da loja que deseja acessar'; end if;
 end if;
 select * into v_inv from public.organization_invites
  where lower(email)=v_email and (p_convite_id is null or id=p_convite_id)
    and (status='pendente' or (status='aceito' and used_by=v_user))
  order by created_at desc limit 1 for update;
 if not found then raise exception 'Convite inválido ou revogado. Confira se entrou com o e-mail convidado'; end if;
 if v_inv.status='aceito' and v_inv.used_by=v_user then
  if v_org=v_inv.organization_id then return v_org; end if;
  raise exception 'Seu acesso foi removido. Peça um novo convite ao dono';
 end if;
 if v_inv.expires_at is not null and v_inv.expires_at<=now() then raise exception 'Convite expirado. Peça um novo convite ao dono'; end if;
 if v_confirmado is null then raise exception 'Confirme seu e-mail antes de aceitar o convite'; end if;
 if v_org is not null and v_org<>v_inv.organization_id then raise exception 'Esta conta já pertence a outra loja. Use um acesso separado'; end if;
 if exists(select 1 from public.access_requests where user_id=v_user and status='rejeitado') then raise exception 'Acesso bloqueado pela plataforma. Entre em contato com o suporte'; end if;
 if v_inv.papel not in ('gerente','caixa','financeiro') then raise exception 'Perfil do convite inválido'; end if;
 select owner_user_id into v_dono from public.organizations where id=v_inv.organization_id;
 if not public.fn_assinatura_permite_acesso(v_inv.organization_id) then raise exception 'A loja precisa regularizar o acesso antes de aceitar convites'; end if;
 insert into public.access_requests(user_id,email,status,decided_by,decided_at)
 values(v_user,v_email,'aprovado',v_dono,now())
 on conflict(user_id) do update set status='aprovado',decided_by=v_dono,decided_at=now(),updated_at=now();
 insert into public.organization_members(organization_id,user_id,papel,email)
 values(v_inv.organization_id,v_user,v_inv.papel,v_email)
 on conflict(organization_id,user_id) do nothing;
 update public.organization_invites set status='aceito',used_at=now(),used_by=v_user where id=v_inv.id;
 perform public.log_auditoria('convite_equipe_aceito','organization_invites',v_inv.id,jsonb_build_object('papel',v_inv.papel));
 return v_inv.organization_id;
end $$;
revoke all on function public.aceitar_convite_equipe(uuid) from public,anon;
grant execute on function public.aceitar_convite_equipe(uuid) to authenticated;

-- Caixa consulta apenas lançamentos próprios feitos hoje, inclusive vendas
-- retroativas. registrado_em preserva o dia real do lançamento.
drop policy if exists caixa_vendas_restritas on public.vendas;
create policy caixa_vendas_restritas on public.vendas as restrictive for all to authenticated
using (public.current_papel()<>'caixa' or (user_id=auth.uid() and (registrado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date))
with check(public.current_papel()<>'caixa' or (user_id=auth.uid() and organization_id=public.current_org_id() and (registrado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date));
drop policy if exists caixa_vendas_sem_exclusao on public.vendas;
create policy caixa_vendas_sem_exclusao on public.vendas as restrictive for delete to authenticated using(public.current_papel()<>'caixa');
drop policy if exists caixa_itens_restritos on public.venda_itens;
create policy caixa_itens_restritos on public.venda_itens as restrictive for all to authenticated
using(public.current_papel()<>'caixa' or exists(select 1 from public.vendas v where v.id=venda_id and v.user_id=auth.uid()))
with check(public.current_papel()<>'caixa' or (user_id=auth.uid() and exists(select 1 from public.vendas v where v.id=venda_id and v.user_id=auth.uid())));
drop policy if exists caixa_itens_sem_exclusao on public.venda_itens;
create policy caixa_itens_sem_exclusao on public.venda_itens as restrictive for delete to authenticated using(public.current_papel()<>'caixa');
drop policy if exists caixa_pagamentos_restritos on public.venda_pagamentos;
create policy caixa_pagamentos_restritos on public.venda_pagamentos as restrictive for all to authenticated
using(public.current_papel()<>'caixa' or exists(select 1 from public.vendas v where v.id=venda_id and v.user_id=auth.uid()))
with check(public.current_papel()<>'caixa' or exists(select 1 from public.vendas v where v.id=venda_id and v.user_id=auth.uid()));
drop policy if exists caixa_pagamentos_sem_exclusao on public.venda_pagamentos;
create policy caixa_pagamentos_sem_exclusao on public.venda_pagamentos as restrictive for delete to authenticated using(public.current_papel()<>'caixa');
drop policy if exists caixa_clientes_sem_edicao on public.clientes;
create policy caixa_clientes_sem_edicao on public.clientes as restrictive for update to authenticated using(public.current_papel()<>'caixa') with check(public.current_papel()<>'caixa');
drop policy if exists caixa_clientes_sem_exclusao on public.clientes;
create policy caixa_clientes_sem_exclusao on public.clientes as restrictive for delete to authenticated using(public.current_papel()<>'caixa');
drop policy if exists caixa_membros_proprios on public.organization_members;
create policy caixa_membros_proprios on public.organization_members as restrictive for select to authenticated using(public.current_papel()<>'caixa' or user_id=auth.uid());
-- Promissória continua possível como consequência de uma nova venda, sem
-- liberar o módulo de cobrança nem o histórico de outros operadores.
drop policy if exists caixa_promissorias_restritas on public.promissorias;
create policy caixa_promissorias_restritas on public.promissorias as restrictive for all to authenticated
using(public.current_papel()<>'caixa' or exists(select 1 from public.vendas v where v.id=venda_id and v.user_id=auth.uid()))
with check(public.current_papel()<>'caixa' or exists(select 1 from public.vendas v where v.id=venda_id and v.user_id=auth.uid()));
drop policy if exists caixa_promissorias_sem_edicao on public.promissorias;
create policy caixa_promissorias_sem_edicao on public.promissorias as restrictive for update to authenticated using(public.current_papel()<>'caixa') with check(public.current_papel()<>'caixa');
drop policy if exists caixa_promissorias_sem_exclusao on public.promissorias;
create policy caixa_promissorias_sem_exclusao on public.promissorias as restrictive for delete to authenticated using(public.current_papel()<>'caixa');
-- Tabelas de gestão permanecem intactas e não ficam disponíveis ao caixa.
do $$ declare v_tabela text; begin
 foreach v_tabela in array array['condicionais','condicional_itens','promissoria_pagamentos','promissoria_itens','eventos','notificacoes','fechamentos_financeiros','comissoes_fechadas','venda_devolucoes','venda_trocas','venda_troca_itens'] loop
  execute format('drop policy if exists caixa_sem_gestao on public.%I',v_tabela);
  execute format('create policy caixa_sem_gestao on public.%I as restrictive for all to authenticated using(public.current_papel()<>''caixa'') with check(public.current_papel()<>''caixa'')',v_tabela);
 end loop;
end $$;

create or replace function public.cadastrar_cliente_caixa(p_nome text,p_telefone text default null)
returns table(id uuid,nome text,cpf text,telefone text,email text)
language plpgsql security invoker set search_path=public as $$
declare v_nome text:=trim(p_nome); v_tel text:=nullif(regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g'),''); v_id uuid; v_qtd int;
begin
 if public.current_org_id() is null or public.current_papel() not in ('owner','gerente','caixa','financeiro') then raise exception 'Sem acesso ao cadastro de cliente'; end if;
 if coalesce(v_nome,'')='' then raise exception 'Informe o nome do cliente'; end if;
 if v_tel is not null and length(v_tel) not in (10,11) then raise exception 'Confira o telefone com DDD'; end if;
 perform pg_advisory_xact_lock(hashtextextended(public.current_org_id()::text||':cliente:'||lower(v_nome),0));
 if v_tel is not null then perform pg_advisory_xact_lock(hashtextextended(public.current_org_id()::text||':telefone:'||v_tel,0)); end if;
 select count(*),(array_agg(c.id))[1] into v_qtd,v_id from public.clientes c
 where c.organization_id=public.current_org_id() and (lower(trim(c.nome))=lower(v_nome) or (v_tel is not null and regexp_replace(coalesce(c.telefone,''),'[^0-9]','','g')=v_tel));
 if v_qtd>0 then raise exception 'Já existe cliente com esse nome ou telefone. Selecione o cadastro existente'; end if;
 insert into public.clientes(nome,telefone,status) values(v_nome,v_tel,'ativo') returning clientes.id into v_id;
 return query select c.id,c.nome,c.cpf,c.telefone,c.email from public.clientes c where c.id=v_id;
end $$;
revoke all on function public.cadastrar_cliente_caixa(text,text) from public,anon;
grant execute on function public.cadastrar_cliente_caixa(text,text) to authenticated;

-- Mantém compatibilidade do onboarding com o convite de equipe.
CREATE OR REPLACE FUNCTION public.garantir_empresa(p_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_org uuid;
  v_convite record;
  v_tem_convite boolean := false;
begin
  if v_user is null then
    raise exception 'Usuario nao autenticado';
  end if;

  v_org := public.aceitar_convite_equipe(null);
  if v_org is not null then return v_org; end if;

  if not exists (
    select 1
    from public.access_requests r
    where r.user_id = v_user and r.status = 'aprovado'
  ) then
    raise exception 'Acesso aguardando aprovacao';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select m.organization_id
    into v_org
    from public.organization_members m
    where m.user_id = v_user
    order by m.created_at
    limit 1;

  if v_org is not null then
    return v_org;
  end if;

  if v_email <> '' then
    select i.*
      into v_convite
      from public.organization_invites i
      where lower(i.email) = v_email
        and i.status = 'pendente'
        and (i.expires_at is null or i.expires_at > now())
      order by i.created_at desc
      limit 1
      for update;
    v_tem_convite := found;
  end if;

  if v_tem_convite then
    insert into public.organization_members (
      organization_id, user_id, papel, email
    ) values (
      v_convite.organization_id, v_user,
      case
        when v_convite.papel in ('owner', 'gerente', 'caixa', 'financeiro')
          then v_convite.papel
        else 'caixa'
      end,
      nullif(v_email, '')
    );

    update public.organization_invites
      set status = 'aceito', used_at = now(), used_by = v_user
      where id = v_convite.id;

    return v_convite.organization_id;
  end if;

  insert into public.organizations (nome, owner_user_id)
  values (coalesce(nullif(trim(p_nome), ''), 'Minha empresa'), v_user)
  returning id into v_org;

  insert into public.organization_members (
    organization_id, user_id, papel, email
  ) values (
    v_org, v_user, 'owner', nullif(v_email, '')
  );

  insert into public.stores (organization_id, nome)
  values (v_org, 'Unidade principal');

  return v_org;
end;
$function$;

-- Estende a fronteira existente de estoque sem liberar edição do catálogo.
CREATE OR REPLACE FUNCTION public.registrar_movimentacao(p_produto_id uuid, p_tipo text, p_quantidade numeric, p_motivo text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text, p_referencia_id uuid DEFAULT NULL::uuid, p_variacao_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_anterior numeric;
  v_qtd numeric := abs(coalesce(p_quantidade, 0));
  v_posterior numeric;
  v_soma boolean;
begin
  -- Idempotência: se já registramos esta chave, não aplica de novo.
  if p_idempotency_key is not null and exists (
    select 1 from public.estoque_movimentacoes where idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  if p_variacao_id is not null then
    select coalesce(estoque, 0), organization_id into v_anterior, v_org
    from public.produto_variacoes where id = p_variacao_id for update;
  else
    select coalesce(estoque, 0), organization_id into v_anterior, v_org
    from public.produtos where id = p_produto_id for update;
  end if;

  if v_org is null then
    raise exception 'Produto/variação não encontrado';
  end if;
  if v_org <> public.current_org_id() then
    raise exception 'Sem acesso a este produto';
  end if;

  if public.current_papel() = 'caixa' then
    if p_tipo <> 'venda' or p_quantidade <= 0 or not exists (
      select 1 from public.vendas v join public.venda_itens i on i.venda_id=v.id
      where v.id=p_referencia_id and v.organization_id=v_org and v.user_id=auth.uid()
        and v.status='concluida'
        and (v.registrado_em at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date
        and i.produto_id=p_produto_id and i.variacao_id is not distinct from p_variacao_id
        and i.quantidade=v_qtd
    ) then raise exception 'Caixa só pode baixar o estoque de uma venda própria'; end if;
    if exists(select 1 from public.estoque_movimentacoes where referencia_id=p_referencia_id and produto_id=p_produto_id and variacao_id is not distinct from p_variacao_id and tipo='venda') then
      raise exception 'A baixa de estoque desta venda já foi registrada';
    end if;
  end if;
  if p_variacao_id is not null and not exists(select 1 from public.produto_variacoes where id=p_variacao_id and produto_id=p_produto_id) then raise exception 'A variação não pertence ao produto'; end if;

  v_soma := p_tipo in (
    'entrada','cancelamento','devolucao','retorno_condicional',
    'estoque_inicial','importacao','ajuste_positivo'
  );

  v_posterior := case when v_soma then v_anterior + v_qtd else v_anterior - v_qtd end;

  if v_posterior < 0 then
    raise exception 'Estoque insuficiente (atual: %, saída: %)', v_anterior, v_qtd;
  end if;

  insert into public.estoque_movimentacoes
    (produto_id, variacao_id, tipo, quantidade, quantidade_anterior, quantidade_posterior,
     motivo, observacao, referencia_id, organization_id, user_id, idempotency_key)
  values
    (p_produto_id, p_variacao_id, p_tipo, v_qtd, v_anterior, v_posterior,
     p_motivo, p_observacao, p_referencia_id, v_org, auth.uid(), p_idempotency_key);

  if p_variacao_id is not null then
    update public.produto_variacoes set estoque = v_posterior where id = p_variacao_id;
  else
    update public.produtos set estoque = v_posterior where id = p_produto_id;
  end if;
end;
$function$;
