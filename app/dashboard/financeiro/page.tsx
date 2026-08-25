"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ReceiptText, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";
import { hojeISO } from "@/lib/datas";
import { carregarNomesResponsaveis } from "@/lib/responsaveis";

type Venda = { id:string; created_at:string; total:number; status:string|null };
type Item = { venda_id:string; produto_id:string; variacao_id:string|null; quantidade:number; custo_unitario:number|null };
type Produto = { id:string; custo:number };
type Variacao = { id:string; custo:number|null };
type Despesa = { id:string; despesa_recorrente_id:string|null; competencia:string|null; descricao:string; categoria:string; valor:number; data:string; responsavel:string|null; observacao:string|null };
type Recorrente = { id:string; descricao:string; categoria:string; valor:number; dia_vencimento:number; ativo:boolean };
type Funcionario = { id:string; nome:string; salario_fixo:number; frequencia_pagamento:"mensal"|"quinzenal"|"semanal"; ativo:boolean|null };
type Pagamento = { id:string; funcionario_id:string; data_pagamento:string; data_prevista:string|null; valor_liquido:number; parcela_numero:number; total_parcelas:number };
type AgendaPag = { competencia:string; data_pagamento:string; parcela_numero:number; total_parcelas:number };

const categorias = ["Aluguel","Fornecedor","Compra de mercadoria","Marketing","Transporte","Embalagem","Sistema","Imposto","Funcionário","Outros"];
const inputCls = "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] focus:bg-white";
const brl = (v:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
const dateBR = (s:string) => s ? s.slice(0,10).split("-").reverse().join("/") : "—";

export default function FinanceiroPage(){
  const { period } = usePeriod();
  const [vendas,setVendas]=useState<Venda[]>([]);
  const [itens,setItens]=useState<Item[]>([]);
  const [produtos,setProdutos]=useState<Produto[]>([]);
  const [variacoes,setVariacoes]=useState<Variacao[]>([]);
  const [despesas,setDespesas]=useState<Despesa[]>([]);
  const [recorrentes,setRecorrentes]=useState<Recorrente[]>([]);
  const [funcionarios,setFuncionarios]=useState<Funcionario[]>([]);
  const [pagamentos,setPagamentos]=useState<Pagamento[]>([]);
  const [agendaFolha,setAgendaFolha]=useState<Record<string,AgendaPag[]>>({});
  const [responsaveis,setResponsaveis]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [erro,setErro]=useState("");
  const [detalhes,setDetalhes]=useState(true);
  const [descricao,setDescricao]=useState(""); const [categoria,setCategoria]=useState("Outros"); const [valor,setValor]=useState(""); const [data,setData]=useState(""); const [responsavel,setResponsavel]=useState(""); const [obs,setObs]=useState("");
  const [rDescricao,setRDescricao]=useState(""); const [rCategoria,setRCategoria]=useState("Aluguel"); const [rValor,setRValor]=useState(""); const [rDia,setRDia]=useState("5");
  const [salvando,setSalvando]=useState(false);

  const janela=useMemo(()=>{const a=isoToDate(period.inicio);a.setHours(0,0,0,0);const b=isoToDate(period.fim);b.setHours(0,0,0,0);b.setDate(b.getDate()+1);return {ini:a.getTime(),fim:b.getTime()};},[period]);
  const noPeriodo=(s:string)=>{const t=isoToDate(s.slice(0,10)).getTime();return t>=janela.ini&&t<janela.fim;};
  const competencia=`${period.inicio.slice(0,7)}-01`;

  async function carregar(){
    setLoading(true);setErro("");
    const [v,i,p,pv,d,r,f,pg]=await Promise.all([
      supabase.from("vendas").select("id,created_at,total,status").order("created_at",{ascending:false}),
      supabase.from("venda_itens").select("venda_id,produto_id,variacao_id,quantidade,custo_unitario"),
      supabase.from("produtos").select("id,custo"),
      supabase.from("produto_variacoes").select("id,custo"),
      supabase.from("despesas").select("id,despesa_recorrente_id,competencia,descricao,categoria,valor,data,responsavel,observacao").order("data",{ascending:false}),
      supabase.from("despesas_recorrentes").select("id,descricao,categoria,valor,dia_vencimento,ativo").order("dia_vencimento"),
      supabase.from("funcionarios").select("id,nome,salario_fixo,frequencia_pagamento,ativo").order("nome"),
      supabase.from("pagamentos_funcionario").select("id,funcionario_id,data_pagamento,data_prevista,valor_liquido,parcela_numero,total_parcelas").order("data_pagamento",{ascending:false}),
    ]);
    const e=v.error||i.error||p.error||pv.error||d.error||r.error||f.error||pg.error; if(e)setErro(e.message);
    setVendas((v.data as Venda[])||[]);setItens((i.data as Item[])||[]);setProdutos((p.data as Produto[])||[]);setVariacoes((pv.data as Variacao[])||[]);setDespesas((d.data as Despesa[])||[]);setRecorrentes((r.data as Recorrente[])||[]);setFuncionarios((f.data as Funcionario[])||[]);setPagamentos((pg.data as Pagamento[])||[]);
    const funcs=((f.data as Funcionario[])||[]).filter(x=>x.ativo!==false); const agendas:Record<string,AgendaPag[]>={};
    await Promise.all(funcs.map(async fn=>{const {data:a}=await supabase.rpc("agenda_pagamentos_funcionario",{p_funcionario_id:fn.id,p_competencia:competencia});agendas[fn.id]=(a as AgendaPag[])||[];})); setAgendaFolha(agendas);
    setResponsaveis(await carregarNomesResponsaveis()); setLoading(false);
  }
  useEffect(()=>{carregar();},[period.inicio,period.fim]);

  const concluidas=useMemo(()=>vendas.filter(v=>v.status==="concluida"&&noPeriodo(v.created_at)),[vendas,janela]);
  const ids=useMemo(()=>new Set(concluidas.map(v=>v.id)),[concluidas]);
  const receita=useMemo(()=>concluidas.reduce((s,v)=>s+Number(v.total||0),0),[concluidas]);
  const custoMap=useMemo(()=>new Map(produtos.map(p=>[p.id,Number(p.custo||0)])),[produtos]);
  const custoVarMap=useMemo(()=>new Map(variacoes.map(v=>[v.id,Number(v.custo||0)])),[variacoes]);
  const custoProdutos=useMemo(()=>itens.filter(i=>ids.has(i.venda_id)).reduce((s,i)=>{const snap=Number(i.custo_unitario||0);const fallback=i.variacao_id?Number(custoVarMap.get(i.variacao_id)||0):Number(custoMap.get(i.produto_id)||0);return s+(snap>0?snap:fallback)*Number(i.quantidade||0);},0),[itens,ids,custoMap,custoVarMap]);
  const despPeriodo=useMemo(()=>despesas.filter(d=>noPeriodo(d.data)),[despesas,janela]);
  const comprasEstoque=useMemo(()=>despPeriodo.filter(d=>d.categoria.toLowerCase().includes("mercadoria")).reduce((s,d)=>s+Number(d.valor||0),0),[despPeriodo]);
  const fixas=useMemo(()=>despPeriodo.filter(d=>!!d.despesa_recorrente_id).reduce((s,d)=>s+Number(d.valor||0),0),[despPeriodo]);
  const outras=useMemo(()=>despPeriodo.filter(d=>!d.despesa_recorrente_id&&!d.categoria.toLowerCase().includes("mercadoria")).reduce((s,d)=>s+Number(d.valor||0),0),[despPeriodo]);
  const folhaPaga=useMemo(()=>pagamentos.filter(p=>noPeriodo(p.data_pagamento)).reduce((s,p)=>s+Number(p.valor_liquido||0),0),[pagamentos,janela]);
  const despesasOperacionais=fixas+outras+folhaPaga;
  const lucroLiquido=receita-custoProdutos-despesasOperacionais;
  const saidaCaixa=fixas+outras+comprasEstoque+folhaPaga;
  const caixaPeriodo=receita-saidaCaixa;

  const folhaPrevista=useMemo(()=>funcionarios.filter(f=>f.ativo!==false).flatMap(f=>{const ag=agendaFolha[f.id]||[];return ag.map(a=>({funcionario:f,data:a.data_pagamento,parcela:a.parcela_numero,total:a.total_parcelas,valor:Number(f.salario_fixo||0)/Math.max(1,a.total_parcelas),pago:pagamentos.some(p=>p.funcionario_id===f.id&&p.data_prevista===a.data_pagamento&&p.parcela_numero===a.parcela_numero)}));}),[funcionarios,agendaFolha,pagamentos]);

  async function addDespesa(){const n=Number(valor);if(!descricao.trim()||!Number.isFinite(n)||n<=0){setErro("Informe descrição e valor válidos.");return;}setSalvando(true);const {error}=await supabase.from("despesas").insert({descricao:descricao.trim(),categoria,valor:n,data:data||hojeISO(),responsavel:responsavel||null,observacao:obs||null});if(error)setErro(error.message);else{setDescricao("");setValor("");setData("");setResponsavel("");setObs("");await carregar();}setSalvando(false);}
  async function addRec(){const n=Number(rValor),dia=Number(rDia);if(!rDescricao.trim()||!Number.isFinite(n)||n<=0){setErro("Informe a conta recorrente e o valor.");return;}setSalvando(true);const {error}=await supabase.from("despesas_recorrentes").insert({descricao:rDescricao.trim(),categoria:rCategoria,valor:n,dia_vencimento:Math.min(31,Math.max(1,dia||5)),ativo:true});if(error)setErro(error.message);else{setRDescricao("");setRValor("");await carregar();}setSalvando(false);}
  async function lancarRec(r:Recorrente){const {error}=await supabase.rpc("lancar_despesa_recorrente",{p_recorrente_id:r.id,p_competencia:competencia});if(error)setErro(error.message);else await carregar();}

  const recorrenteLancada=(r:Recorrente)=>despesas.some(d=>d.despesa_recorrente_id===r.id&&(d.competencia||"").startsWith(competencia.slice(0,7)));

  return <section className="space-y-6">
    <PageHeader eyebrow="Gestão financeira" title="Financeiro" description="Resultado da operação e fluxo de caixa separados, sem contar a mesma mercadoria duas vezes." />
    {erro&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {[
        ["Faturamento",receita,"Vendas concluídas"],
        ["Custo dos produtos",custoProdutos,"Calculado automaticamente pelas vendas"],
        ["Despesas operacionais",despesasOperacionais,"Fixas + adicionadas + folha paga"],
        ["Lucro líquido",lucroLiquido,"Faturamento − custo − despesas"],
        ["Caixa do período",caixaPeriodo,"Considera também compras de estoque pagas"],
      ].map(([l,v,s])=><div key={String(l)} className="rounded-[28px] border border-[#e8ecf4] bg-white p-5"><p className="text-sm font-bold text-[#475569]">{String(l)}</p><p className="mt-3 text-2xl font-black text-[#0f172a]">{brl(Number(v))}</p><p className="mt-2 text-xs text-[#94a3b8]">{String(s)}</p></div>)}
    </div>

    <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
      <button onClick={()=>setDetalhes(x=>!x)} className="flex w-full items-center justify-between text-left"><div><h2 className="text-xl font-black text-[#0f172a]">Despesas e custos</h2><p className="mt-1 text-sm text-[#64748b]">Clique para abrir a composição completa do período.</p></div>{detalhes?<ChevronUp/>:<ChevronDown/>}</button>
      {detalhes&&<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Custo dos produtos vendidos",custoProdutos,"Entra no lucro quando a peça é vendida"],
          ["Despesas fixas mensais",fixas,"Contas recorrentes já lançadas"],
          ["Funcionários / folha",folhaPaga,"Pagamentos efetivamente registrados"],
          ["Despesas acrescentadas",outras,"Taxas, marketing, impostos e outras"],
          ["Compras de mercadoria",comprasEstoque,"Saída de caixa; não duplica o COGS no lucro"],
        ].map(([l,v,s])=><div key={String(l)} className="rounded-2xl bg-[#f8fafc] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#64748b]">{String(l)}</p><p className="mt-2 text-xl font-black text-[#0f172a]">{brl(Number(v))}</p><p className="mt-1 text-xs text-[#94a3b8]">{String(s)}</p></div>)}
      </div>}
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[#2563eb]"/><h2 className="text-xl font-black text-[#0f172a]">Contas recorrentes da loja</h2></div>
        <p className="mt-1 text-sm text-[#64748b]">Aluguel, internet, sistemas e outras despesas fixas.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1.4fr_1fr_.8fr_.6fr_auto]"><input className={inputCls} value={rDescricao} onChange={e=>setRDescricao(e.target.value)} placeholder="Descrição"/><select className={inputCls} value={rCategoria} onChange={e=>setRCategoria(e.target.value)}>{categorias.map(c=><option key={c}>{c}</option>)}</select><input className={inputCls} type="number" value={rValor} onChange={e=>setRValor(e.target.value)} placeholder="Valor"/><input className={inputCls} type="number" min="1" max="31" value={rDia} onChange={e=>setRDia(e.target.value)}/><button onClick={addRec} disabled={salvando} className="rounded-2xl bg-[#2563eb] px-4 py-3 text-sm font-bold text-white">Adicionar</button></div>
        <div className="mt-4 space-y-2">{recorrentes.filter(r=>r.ativo).map(r=><div key={r.id} className="flex items-center justify-between rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4"><div><p className="font-bold text-[#0f172a]">{r.descricao}</p><p className="text-sm text-[#64748b]">{r.categoria} · dia {r.dia_vencimento} · {brl(Number(r.valor))}</p></div>{recorrenteLancada(r)?<span className="text-xs font-bold text-green-700">Lançada</span>:<button onClick={()=>lancarRec(r)} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700">Lançar mês</button>}</div>)}</div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-[#7c3aed]"/><h2 className="text-xl font-black text-[#0f172a]">Funcionários — conta recorrente</h2></div>
        <p className="mt-1 text-sm text-[#64748b]">Agenda de pagamentos da competência selecionada. O que foi pago entra automaticamente nas despesas.</p>
        <div className="mt-4 space-y-2">{folhaPrevista.map(x=><div key={`${x.funcionario.id}-${x.data}`} className="flex items-center justify-between rounded-2xl border border-[#eee9ff] bg-[#faf8ff] p-4"><div><p className="font-bold text-[#0f172a]">{x.funcionario.nome} · {x.parcela}/{x.total}</p><p className="text-sm text-[#64748b]">Previsto {dateBR(x.data)} · base {brl(x.valor)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${x.pago?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>{x.pago?"Pago":"Pendente"}</span></div>)}</div>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6"><h2 className="text-xl font-black text-[#0f172a]">Nova despesa</h2><div className="mt-4 space-y-3"><input className={inputCls} value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Descrição"/><select className={inputCls} value={categoria} onChange={e=>setCategoria(e.target.value)}>{categorias.map(c=><option key={c}>{c}</option>)}</select><input className={inputCls} type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="Valor"/><input className={inputCls} type="date" value={data} onChange={e=>setData(e.target.value)}/><select className={inputCls} value={responsavel} onChange={e=>setResponsavel(e.target.value)}><option value="">Responsável (opcional)</option>{responsaveis.map(r=><option key={r}>{r}</option>)}</select><textarea className={inputCls} value={obs} onChange={e=>setObs(e.target.value)} placeholder="Observação"/><button onClick={addDespesa} disabled={salvando} className="w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white">Registrar despesa</button></div></div>
      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6"><h2 className="text-xl font-black text-[#0f172a]">Movimentações de despesa</h2>{loading?<p className="mt-4 text-sm text-[#64748b]">Carregando...</p>:<div className="mt-4 space-y-2">{despPeriodo.map(d=><div key={d.id} className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-bold text-[#0f172a]">{d.descricao}</p><p className="mt-1 text-sm text-[#64748b]">{d.categoria} · {dateBR(d.data)}{d.despesa_recorrente_id?" · recorrente":""}</p>{d.observacao&&<p className="mt-1 text-xs text-[#94a3b8]">{d.observacao}</p>}</div><p className="font-black text-[#b91c1c]">− {brl(Number(d.valor))}</p></div></div>)}</div>}</div>
    </div>
  </section>;
}
