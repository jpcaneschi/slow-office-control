from pathlib import Path

p = Path('app/dashboard/folha/page.tsx')
s = p.read_text(encoding='utf-8')

old = '''    const agenda = gerarDatasPagamentoMes(funcionario, competencia);
    const salarios = distribuirValor(Number(acerto.salario || 0), agenda.length);
    let saldoTransportado = 0;

    return agenda.map((item, indice) => {
      const ultima = indice === agenda.length - 1;
      const comissao = ultima ? Number(acerto.comissao || 0) : 0;
      const repasse = ultima ? Number(acerto.repasse || 0) : 0;'''
new = '''    const agenda = gerarDatasPagamentoMes(funcionario, competencia);
    const salarios = distribuirValor(Number(acerto.salario || 0), agenda.length);
    const bonificacoes = distribuirValor(Number(acerto.comissao || 0), agenda.length);
    let saldoTransportado = 0;

    return agenda.map((item, indice) => {
      const ultima = indice === agenda.length - 1;
      const comissao = Number(bonificacoes[indice] || 0);
      const repasse = ultima ? Number(acerto.repasse || 0) : 0;'''
assert old in s, 'montarParcelas não encontrado'
s = s.replace(old, new, 1)

old = '''    if (
      parcela.ultima &&
      funcionario.comissao_base === "lucro_loja" &&
      !acerto.comissaoFechada
    ) {
      setErro(
        `Feche primeiro a comissão de ${mesAnoPt(
          competenciaOrigem
        )} antes do último pagamento de ${mesAnoPt(competencia)}.`
      );'''
new = '''    if (
      funcionario.comissao_base === "lucro_loja" &&
      !acerto.comissaoFechada
    ) {
      setErro(
        `Feche primeiro a bonificação de ${mesAnoPt(
          competenciaOrigem
        )} antes de registrar pagamentos de ${mesAnoPt(competencia)}.`
      );'''
assert old in s, 'podeProcessarComissao não encontrado'
s = s.replace(old, new, 1)

s = s.replace('''          ? `Comissão de ${mesAnoPt(
              competenciaOrigem
            )} fechada e carregada para ${mesAnoPt(competencia)}.`
          : `A comissão de ${mesAnoPt(
              competenciaOrigem
            )} já estava fechada ou não há funcionário configurado nessa base.`''','''          ? `Bonificação de ${mesAnoPt(
              competenciaOrigem
            )} fechada e distribuída nos pagamentos de ${mesAnoPt(competencia)}.`
          : `A bonificação de ${mesAnoPt(
              competenciaOrigem
            )} já estava fechada ou não há funcionário configurado nessa base.`''',1)

s = s.replace('''                  Comissão mensal: {mesAnoPt(competenciaOrigem)} → {mesAnoPt(competencia)}''','''                  Bonificação mensal: {mesAnoPt(competenciaOrigem)} → {mesAnoPt(competencia)}''',1)
s = s.replace('''                    ? "Fechamento concluído. A base ficou congelada e entra no último pagamento desta competência."
                    : "A base será o resultado mensal do Financeiro, sem descontar custo de produto uma segunda vez."}''','''                    ? "Fechamento concluído. A bonificação ficou congelada e é dividida entre os pagamentos desta competência."
                    : "O valor oficial nasce no fechamento do mês anterior e depois é dividido junto com o salário do mês seguinte."}''',1)

# Na grade de pagamento, lucro_loja vira Bonificação; outros modelos continuam como Comissão.
s = s.replace('''                              <p className="text-[#64748b]">
                                Comissão: <strong className="text-[#15803d]">{formatCurrency(parcela.comissao)}</strong>
                              </p>''','''                              <p className="text-[#64748b]">
                                {funcionario.comissao_base === "lucro_loja" ? "Bonificação" : "Comissão"}: <strong className="text-[#15803d]">{formatCurrency(parcela.comissao)}</strong>
                              </p>''',1)

p.write_text(s, encoding='utf-8')

# Gera migration a partir da função atual, alterando somente a distribuição da bonificação.
sq = Path('supabase/migrations/0062_financeiro_recebido_e_agenda_operacao.sql').read_text(encoding='utf-8')
start = sq.index('create or replace function public.agenda_operacao_mes')
end_marker = 'grant execute on function public.agenda_operacao_mes(date) to authenticated;'
end = sq.index(end_marker, start) + len(end_marker)
fn = sq[start:end]
old_sql = '''         + case when a.parcela_numero=a.total_parcelas then coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0) else 0 end
         - coalesce((select sum(vd.valor) from public.vale_descontos vd where vd.organization_id=x.org and vd.funcionario_id=f.id and vd.competencia=x.ini and vd.parcela_pagamento=a.parcela_numero and vd.status<>'cancelado'),0) base_valor'''
new_sql = '''         + case
             when a.parcela_numero<a.total_parcelas then
               floor(coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)*100/a.total_parcelas)/100
             else
               coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)
               - (floor(coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)*100/a.total_parcelas)/100)*(a.total_parcelas-1)
           end
         - coalesce((select sum(vd.valor) from public.vale_descontos vd where vd.organization_id=x.org and vd.funcionario_id=f.id and vd.competencia=x.ini and vd.parcela_pagamento=a.parcela_numero and vd.status<>'cancelado'),0) base_valor'''
assert old_sql in fn, 'fórmula antiga da agenda não encontrada'
fn = fn.replace(old_sql, new_sql, 1)

migration = '''-- Bonificação sobre lucro: valor oficial do mês anterior é distribuído entre\n-- todos os pagamentos do mês seguinte, junto com o salário. Vales continuam\n-- descontos independentes na(s) parcela(s) programada(s).\n\n''' + fn + '\n'
Path('supabase/migrations/0070_bonificacao_distribuida_na_folha.sql').write_text(migration, encoding='utf-8')
print('folha e migration 0070 atualizadas')
