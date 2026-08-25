"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, FileText, ShoppingCart, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";
import { SalesPanel, type VendaLite } from "@/components/dashboard/sales-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import { RecentSales, type VendaRow } from "@/components/dashboard/recent-sales";
import { TasksAlerts } from "@/components/dashboard/tasks-alerts";
import { usePeriod, presetRange, isoToDate } from "@/components/dashboard/period-context";
import { usePapel } from "@/components/dashboard/role-context";
import { podeAcessar } from "@/lib/permissoes";
import { TopProducts } from "@/components/dashboard/top-products";
import { rankearProdutosMaisVendidos } from "@/lib/mais-vendidos-utils";

type Venda = { id:string; cliente_id:string|null; forma_pagamento:string; total:number|null; status:string; created_at:string };
type Cliente = { id:string; nome:string };
type Condicional = { id:string; status:string };
type Resumo = { faturamento_recebido:number; contas_receber:number };

function startOfDay(d:Date){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function somaConcluidas(vendas:Venda[],inicio:Date,fim:Date){const a=inicio.getTime(),b=fim.getTime();return vendas.filter(v=>v.status==="concluida").filter(v=>{const t=new Date(v.created_at).getTime();return t>=a&&t<b;}).reduce((s,v)=>s+Number(v.total||0),0);}
function variacao(atual:number,anterior:number){if(anterior<=0)return atual>0?100:0;return((atual-anterior)/anterior)*100;}

export function DashboardHome(){
  const {period}=usePeriod();
  const {papel}=usePapel();
  const podeVerFinanceiro=podeAcessar(papel,"/dashboard/financeiro");
  const [vendas,setVendas]=useState<Venda[]>([]);
  const [clientes,setClientes]=useState<Cliente[]>([]);
  const [condicionais,setCondicionais]=useState<Condicional[]>([]);
  const [itens,setItens]=useState<{venda_id:string;produto_id:string;quantidade:number;total_item:number}[]>([]);
  const [produtos,setProdutos]=useState<{id:string;nome:string}[]>([]);
  const [resumo,setResumo]=useState<Resumo>({faturamento_recebido:0,contas_receber:0});
  const [loading,setLoading]=useState(true);
  const [erro,setErro]=useState("");

  const carregar=useCallback(async()=>{
    setLoading(true);setErro("");
    const agora=new Date();const competencia=`${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,"0")}-01`;
    const [v,c,cond,i,p,r]=await Promise.all([
      supabase.from("vendas").select("id,cliente_id,forma_pagamento,total,status,created_at").order("created_at",{ascending:false}),
      supabase.from("clientes").select("id,nome"),
      supabase.from("condicionais").select("id,status"),
      supabase.from("venda_itens").select("venda_id,produto_id,quantidade,total_item"),
      supabase.from("produtos").select("id,nome"),
      supabase.rpc("resumo_financeiro_mes",{p_competencia:competencia}),
    ]);
    const err=v.error||c.error||cond.error||i.error||p.error||r.error;if(err)setErro(err.message);
    setVendas((v.data as Venda[]|null)||[]);setClientes((c.data as Cliente[]|null)||[]);setCondicionais((cond.data as Condicional[]|null)||[]);setItens(i.data||[]);setProdutos(p.data||[]);
    const linha=Array.isArray(r.data)?r.data[0]:r.data;setResumo({faturamento_recebido:Number(linha?.faturamento_recebido||0),contas_receber:Number(linha?.contas_receber||0)});
    setLoading(false);
  },[]);
  useEffect(()=>{carregar();},[carregar]);

  const janela=useMemo(()=>{const inicio=startOfDay(isoToDate(period.inicio));const fim=startOfDay(isoToDate(period.fim));fim.setDate(fim.getDate()+1);const anteriorFim=inicio;const anteriorInicio=new Date(inicio.getTime()-(fim.getTime()-inicio.getTime()));const ehHoje=period.inicio===presetRange("hoje").inicio&&period.fim===presetRange("hoje").fim;return{inicio,fim,anteriorInicio,anteriorFim,ehHoje};},[period]);
  const clienteNome=useMemo(()=>new Map(clientes.map(c=>[c.id,c.nome])),[clientes]);
  const vendasPeriodo=somaConcluidas(vendas,janela.inicio,janela.fim);
  const vendasAnterior=somaConcluidas(vendas,janela.anteriorInicio,janela.anteriorFim);
  const qtdPeriodo=vendas.filter(v=>v.status==="concluida"&&new Date(v.created_at).getTime()>=janela.inicio.getTime()&&new Date(v.created_at).getTime()<janela.fim.getTime()).length;
  const spark=useMemo(()=>{const hoje=startOfDay(new Date());const arr:number[]=[];for(let x=6;x>=0;x--){const d=new Date(hoje);d.setDate(d.getDate()-x);const prox=new Date(d);prox.setDate(prox.getDate()+1);arr.push(somaConcluidas(vendas,d,prox));}return arr;},[vendas]);
  const vendasLite:VendaLite[]=useMemo(()=>vendas.map(v=>({total:v.total,status:v.status,created_at:v.created_at})),[vendas]);
  const maisVendidos=useMemo(()=>rankearProdutosMaisVendidos(vendas,itens,produtos,janela.inicio.getTime(),janela.fim.getTime()),[vendas,itens,produtos,janela]);
  const ultimas:VendaRow[]=useMemo(()=>vendas.filter(v=>{const t=new Date(v.created_at).getTime();return t>=janela.inicio.getTime()&&t<janela.fim.getTime();}).slice(0,8).map(v=>{const d=new Date(v.created_at);return{id:v.id,cliente:(v.cliente_id&&clienteNome.get(v.cliente_id))||"Sem cliente",pagamento:v.forma_pagamento,valor:Number(v.total||0),status:v.status,data:`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};}),[vendas,janela,clienteNome]);
  const condicionaisAbertas=condicionais.filter(c=>c.status==="aberto").length;

  return <div className="space-y-6">
    {erro&&<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Não foi possível carregar alguns dados: {erro}</div>}
    <SalesPanel vendas={vendasLite} loading={loading} onRefresh={carregar}/>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={ShoppingCart} tint="#2563eb" title={janela.ehHoje?"Vendas hoje":"Vendas no período"} value={loading?"…":formatCurrency(vendasPeriodo)} delta={loading?undefined:variacao(vendasPeriodo,vendasAnterior)} deltaLabel={janela.ehHoje?"vs ontem":"vs período anterior"} spark={spark} href="/dashboard/vendas" ariaLabel="Ver vendas"/>
      {podeVerFinanceiro&&<MetricCard icon={CircleDollarSign} tint="#7c3aed" title="Faturamento do mês" value={loading?"…":formatCurrency(resumo.faturamento_recebido)} deltaLabel="valor efetivamente recebido" spark={spark} href="/dashboard/financeiro" ariaLabel="Ver financeiro"/>}
      <MetricCard icon={Wallet} tint="#0891b2" title="Contas a receber" value={loading?"…":formatCurrency(resumo.contas_receber)} href="/dashboard/promissorias?status=em_aberto" ariaLabel="Ver promissórias a receber"/>
      <MetricCard icon={FileText} tint="#ea580c" title="Condicionais em aberto" value={loading?"…":String(condicionaisAbertas)} href="/dashboard/condicional?status=aberto" ariaLabel="Ver condicionais em aberto"/>
    </section>
    <TopProducts produtos={maisVendidos} loading={loading}/>
    <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[0.95fr_1.2fr_1fr]">
      <MiniCalendar/>
      <RecentSales vendas={ultimas} totalQtd={qtdPeriodo} totalValor={vendasPeriodo} loading={loading}/>
      <TasksAlerts/>
    </section>
  </div>;
}
