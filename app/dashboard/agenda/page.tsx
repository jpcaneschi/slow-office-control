"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, LayoutGrid, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EventoForm } from "@/components/dashboard/evento-form";
import { type Evento, toISODate } from "@/lib/eventos-utils";
import { feriadosDoAno } from "@/lib/feriados";

type Cliente={id:string;nome:string};
type Venda={id:string;created_at:string;total:number;status:string|null};
type Item={venda_id:string;produto_id:string;variacao_id:string|null;quantidade:number};
type Produto={id:string;nome:string};
type Variacao={id:string;tamanho:string|null};
type Despesa={id:string;descricao:string;categoria:string;valor:number;data:string;despesa_recorrente_id:string|null};
type Recorrente={id:string;descricao:string;categoria:string;valor:number;dia_vencimento:number;ativo:boolean};
type Funcionario={id:string;nome:string;salario_fixo:number;ativo:boolean|null};
type Pagamento={id:string;funcionario_id:string;data_pagamento:string;data_prevista:string|null;valor_liquido:number;parcela_numero:number;total_parcelas:number};
type AgendaPag={competencia:string;data_pagamento:string;parcela_numero:number;total_parcelas:number};
type AutoItem={id:string;data:string;tipo:"venda"|"despesa"|"recorrente"|"folha";titulo:string;valor?:number;detalhe?:string;pago?:boolean};

const MESES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS=["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
const brl=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
const fmt=(s:string)=>s.slice(0,10).split("-").reverse().join("/");
const cores:Record<AutoItem["tipo"],string>={venda:"#16a34a",despesa:"#dc2626",recorrente:"#f59e0b",folha:"#7c3aed"};

export default function AgendaPage(){
  const [view,setView]=useState<"lista"|"mes">("mes");
  const [mes,setMes]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);});
  const [eventos,setEventos]=useState<Evento[]>([]); const [clientes,setClientes]=useState<Cliente[]>([]);
  const [vendas,setVendas]=useState<Venda[]>([]); const [itens,setItens]=useState<Item[]>([]); const [produtos,setProdutos]=useState<Produto[]>([]); const [variacoes,setVariacoes]=useState<Variacao[]>([]);
  const [despesas,setDespesas]=useState<Despesa[]>([]); const [recorrentes,setRecorrentes]=useState<Recorrente[]>([]); const [funcionarios,setFuncionarios]=useState<Funcionario[]>([]); const [pagamentos,setPagamentos]=useState<Pagamento[]>([]); const [agendas,setAgendas]=useState<Record<string,AgendaPag[]>>({});
  const [formOpen,setFormOpen]=useState(false); const [editando,setEditando]=useState<Evento|null>(null); const [dataPadrao,setDataPadrao]=useState<string|undefined>(); const [erro,setErro]=useState(""); const [loading,setLoading]=useState(true);
  const competencia=`${mes.getFullYear()}-${String(mes.getMonth()+1).padStart(2,"0")}-01`;

  const carregar=useCallback(async()=>{
    setLoading(true);setErro("");
    const [e,c,v,i,p,pv,d,r,f,pg]=await Promise.all([
      supabase.from("eventos").select("*").order("data").order("hora"),
      supabase.from("clientes").select("id,nome"),
      supabase.from("vendas").select("id,created_at,total,status").order("created_at"),
      supabase.from("venda_itens").select("venda_id,produto_id,variacao_id,quantidade"),
      supabase.from("produtos").select("id,nome"),
      supabase.from("produto_variacoes").select("id,tamanho"),
      supabase.from("despesas").select("id,descricao,categoria,valor,data,despesa_recorrente_id").order("data"),
      supabase.from("despesas_recorrentes").select("id,descricao,categoria,valor,dia_vencimento,ativo").order("dia_vencimento"),
      supabase.from("funcionarios").select("id,nome,salario_fixo,ativo").order("nome"),
      supabase.from("pagamentos_funcionario").select("id,funcionario_id,data_pagamento,data_prevista,valor_liquido,parcela_numero,total_parcelas"),
    ]);
    const err=e.error||v.error||d.error||r.error||f.error||pg.error;if(err)setErro(err.message);
    setEventos((e.data as Evento[])||[]);setClientes((c.data as Cliente[])||[]);setVendas((v.data as Venda[])||[]);setItens((i.data as Item[])||[]);setProdutos((p.data as Produto[])||[]);setVariacoes((pv.data as Variacao[])||[]);setDespesas((d.data as Despesa[])||[]);setRecorrentes((r.data as Recorrente[])||[]);setFuncionarios((f.data as Funcionario[])||[]);setPagamentos((pg.data as Pagamento[])||[]);
    const aa:Record<string,AgendaPag[]>={};await Promise.all(((f.data as Funcionario[])||[]).filter(x=>x.ativo!==false).map(async fn=>{const {data:a}=await supabase.rpc("agenda_pagamentos_funcionario",{p_funcionario_id:fn.id,p_competencia:competencia});aa[fn.id]=(a as AgendaPag[])||[];}));setAgendas(aa);setLoading(false);
  },[competencia]);
  useEffect(()=>{carregar();},[carregar]);

  const nomes=useMemo(()=>new Map(produtos.map(p=>[p.id,p.nome])),[produtos]); const tamanhos=useMemo(()=>new Map(variacoes.map(v=>[v.id,v.tamanho])),[variacoes]);
  const auto=useMemo(()=>{
    const out:AutoItem[]=[];
    vendas.filter(v=>v.status==="concluida").forEach(v=>{const data=toISODate(new Date(v.created_at));const its=itens.filter(i=>i.venda_id===v.id);const detalhe=its.map(i=>`${i.quantidade}x ${nomes.get(i.produto_id)||"Produto"}${i.variacao_id&&tamanhos.get(i.variacao_id)?` ${tamanhos.get(i.variacao_id)}`:""}`).join(" · ");out.push({id:`v-${v.id}`,data,tipo:"venda",titulo:`Venda ${brl(Number(v.total||0))}`,valor:Number(v.total||0),detalhe});});
    despesas.forEach(d=>out.push({id:`d-${d.id}`,data:d.data,tipo:"despesa",titulo:d.descricao,valor:Number(d.valor||0),detalhe:d.categoria,pago:true}));
    recorrentes.filter(r=>r.ativo).forEach(r=>{const last=new Date(mes.getFullYear(),mes.getMonth()+1,0).getDate();const dia=Math.min(last,Math.max(1,r.dia_vencimento));const data=`${mes.getFullYear()}-${String(mes.getMonth()+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;const ja=despesas.some(d=>d.despesa_recorrente_id===r.id&&d.data.slice(0,7)===data.slice(0,7));if(!ja)out.push({id:`r-${r.id}-${data}`,data,tipo:"recorrente",titulo:r.descricao,valor:Number(r.valor||0),detalhe:`${r.categoria} · conta recorrente`,pago:false});});
    funcionarios.filter(f=>f.ativo!==false).forEach(f=>(agendas[f.id]||[]).forEach(a=>{const pago=pagamentos.find(p=>p.funcionario_id===f.id&&p.data_prevista===a.data_pagamento&&p.parcela_numero===a.parcela_numero);out.push({id:`f-${f.id}-${a.data_pagamento}`,data:a.data_pagamento,tipo:"folha",titulo:`${f.nome} · pagamento ${a.parcela_numero}/${a.total_parcelas}`,valor:pago?Number(pago.valor_liquido||0):Number(f.salario_fixo||0)/Math.max(1,a.total_parcelas),detalhe:pago?`Pago em ${fmt(pago.data_pagamento)}`:"Pagamento previsto",pago:!!pago});}));
    return out;
  },[vendas,itens,despesas,recorrentes,funcionarios,agendas,pagamentos,nomes,tamanhos,mes]);

  const prefix=`${mes.getFullYear()}-${String(mes.getMonth()+1).padStart(2,"0")}`;
  const eventosMes=eventos.filter(e=>e.data.startsWith(prefix)); const autoMes=auto.filter(a=>a.data.startsWith(prefix));
  const porDia=useMemo(()=>{const m=new Map<string,{eventos:Evento[];auto:AutoItem[]}>();const get=(d:string)=>{const x=m.get(d)||{eventos:[],auto:[]};m.set(d,x);return x;};eventosMes.forEach(e=>get(e.data).eventos.push(e));autoMes.forEach(a=>get(a.data).auto.push(a));return m;},[eventosMes,autoMes]);
  const cells=useMemo(()=>{const first=new Date(mes.getFullYear(),mes.getMonth(),1),n=new Date(mes.getFullYear(),mes.getMonth()+1,0).getDate();const x:(Date|null)[]=[];for(let i=0;i<first.getDay();i++)x.push(null);for(let d=1;d<=n;d++)x.push(new Date(mes.getFullYear(),mes.getMonth(),d));return x;},[mes]);
  const feriados=feriadosDoAno(mes.getFullYear());
  const lista=useMemo(()=>{const datas=Array.from(porDia.keys()).sort();return datas.map(data=>({data,...porDia.get(data)!}));},[porDia]);

  function novo(data?:string){setEditando(null);setDataPadrao(data);setFormOpen(true);} function editar(e:Evento){setEditando(e);setDataPadrao(undefined);setFormOpen(true);}

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black text-[#0f172a]">Agenda da operação</h1><p className="text-sm text-[#64748b]">Vendas, despesas, contas recorrentes, pagamentos da equipe e eventos no mesmo calendário.</p></div><div className="flex gap-2"><div className="flex rounded-xl border border-[#e8ecf4] bg-white p-1"><button onClick={()=>setView("mes")} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${view==="mes"?"bg-[#2563eb] text-white":"text-[#475569]"}`}><LayoutGrid className="h-4 w-4"/>Mês</button><button onClick={()=>setView("lista")} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${view==="lista"?"bg-[#2563eb] text-white":"text-[#475569]"}`}><List className="h-4 w-4"/>Lista</button></div><button onClick={()=>novo()} className="flex items-center gap-1 rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4"/>Evento</button></div></div>
    {erro&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
    <div className="flex items-center justify-between rounded-2xl border border-[#e8ecf4] bg-white p-3"><button onClick={()=>setMes(new Date(mes.getFullYear(),mes.getMonth()-1,1))} className="rounded-lg p-2 hover:bg-[#f8fafc]"><ChevronLeft/></button><h2 className="font-black text-[#0f172a]">{MESES[mes.getMonth()]} {mes.getFullYear()}</h2><button onClick={()=>setMes(new Date(mes.getFullYear(),mes.getMonth()+1,1))} className="rounded-lg p-2 hover:bg-[#f8fafc]"><ChevronRight/></button></div>
    {loading?<div className="rounded-2xl border border-[#e8ecf4] bg-white p-6 text-sm text-[#64748b]">Carregando agenda...</div>:view==="mes"?<div className="rounded-2xl border border-[#e8ecf4] bg-white p-4"><div className="grid grid-cols-7 gap-1">{DIAS.map(d=><div key={d} className="pb-2 text-center text-[10px] font-bold text-[#94a3b8]">{d}</div>)}{cells.map((d,idx)=>{if(!d)return <div key={idx} className="min-h-[120px] rounded-lg bg-[#fafbfc]"/>;const iso=toISODate(d),x=porDia.get(iso)||{eventos:[],auto:[]};const entries=[...x.auto.map(a=>({id:a.id,label:a.titulo,color:cores[a.tipo],click:undefined as undefined|(()=>void)})),...x.eventos.map(e=>({id:e.id,label:e.titulo,color:"#2563eb",click:()=>editar(e)}))];return <div key={iso} className="min-h-[120px] rounded-xl border border-[#eef2f7] p-1.5"><div className="flex items-center justify-between"><span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-[#334155]">{d.getDate()}</span><button onClick={()=>novo(iso)} className="text-[#94a3b8]"><Plus className="h-3.5 w-3.5"/></button></div>{feriados.get(iso)&&<p className="mt-1 truncate text-[10px] font-bold text-sky-700">{feriados.get(iso)}</p>}<div className="mt-1 space-y-1">{entries.slice(0,5).map(e=><button key={e.id} onClick={e.click} className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[10px] hover:bg-[#f8fafc]"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{background:e.color}}/><span className="truncate text-[#334155]">{e.label}</span></button>)}{entries.length>5&&<p className="px-1 text-[10px] text-[#94a3b8]">+{entries.length-5} mais</p>}</div></div>;})}</div></div>:<div className="space-y-3">{lista.length===0?<div className="rounded-2xl border border-[#e8ecf4] bg-white p-6 text-sm text-[#64748b]">Nenhuma movimentação neste mês.</div>:lista.map(g=><div key={g.data} className="rounded-[26px] border border-[#e8ecf4] bg-white p-5"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#2563eb]"/><h3 className="font-black text-[#0f172a]">{fmt(g.data)}</h3></div><div className="mt-3 space-y-2">{g.auto.map(a=><div key={a.id} className="flex items-start justify-between gap-3 rounded-2xl bg-[#f8fafc] p-3"><div className="flex gap-2"><span className="mt-1.5 h-2 w-2 rounded-full" style={{background:cores[a.tipo]}}/><div><p className="text-sm font-bold text-[#0f172a]">{a.titulo}</p>{a.detalhe&&<p className="mt-0.5 text-xs text-[#64748b]">{a.detalhe}</p>}</div></div>{a.valor!==undefined&&<p className="text-sm font-black text-[#334155]">{brl(a.valor)}</p>}</div>)}{g.eventos.map(e=><button key={e.id} onClick={()=>editar(e)} className="w-full rounded-2xl border border-blue-100 bg-blue-50 p-3 text-left"><p className="text-sm font-bold text-blue-900">{e.titulo}</p><p className="mt-0.5 text-xs text-blue-700">Evento da agenda</p></button>)}</div></div>)}</div>}
    <EventoForm open={formOpen} onClose={()=>setFormOpen(false)} onSaved={carregar} clientes={clientes} evento={editando} dataPadrao={dataPadrao}/>
  </div>;
}
