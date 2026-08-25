"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EventoForm } from "@/components/dashboard/evento-form";
import { feriadosDoAno } from "@/lib/feriados";
import { type Evento, tipoInfo, toISODate } from "@/lib/eventos-utils";

type AutoItem = {
  id: string;
  data: string;
  tipo: string;
  titulo: string;
  detalhe: string | null;
  valor: number | null;
  status: string;
  href: string | null;
};

type Cliente = { id: string; nome: string; data_nascimento: string | null };
type Item = AutoItem & { manual?: boolean; evento?: Evento };

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];

const cores: Record<string,string> = {
  venda: "#16a34a",
  venda_prazo: "#f59e0b",
  recebimento: "#059669",
  compra: "#2563eb",
  despesa: "#dc2626",
  conta: "#f59e0b",
  folha: "#7c3aed",
  promissoria: "#f97316",
  condicional: "#d97706",
  aniversario: "#db2777",
  feriado: "#0ea5e9",
  evento: "#64748b",
};

const labels: Record<string,string> = {
  venda: "Vendas",
  venda_prazo: "Vendas a receber",
  recebimento: "Recebimentos",
  compra: "Compras",
  despesa: "Despesas",
  conta: "Contas a pagar",
  folha: "Equipe",
  promissoria: "Promissórias",
  condicional: "Condicionais",
  aniversario: "Aniversários",
  feriado: "Feriados",
  evento: "Eventos",
};

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}
function fmt(data: string) { return data.slice(0,10).split("-").reverse().join("/"); }

export function AgendaOperacao({ compact = false }: { compact?: boolean }) {
  const [mes,setMes] = useState(() => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1); });
  const [view,setView] = useState<"mes"|"lista">("mes");
  const [automaticos,setAutomaticos] = useState<AutoItem[]>([]);
  const [eventos,setEventos] = useState<Evento[]>([]);
  const [clientes,setClientes] = useState<Cliente[]>([]);
  const [loading,setLoading] = useState(true);
  const [erro,setErro] = useState("");
  const [diaSelecionado,setDiaSelecionado] = useState<string|null>(null);
  const [formOpen,setFormOpen] = useState(false);
  const [editando,setEditando] = useState<Evento|null>(null);
  const [dataPadrao,setDataPadrao] = useState<string|undefined>();

  const competencia = `${mes.getFullYear()}-${String(mes.getMonth()+1).padStart(2,"0")}-01`;
  const prefixo = competencia.slice(0,7);
  const primeiro = `${prefixo}-01`;
  const ultimoDia = new Date(mes.getFullYear(),mes.getMonth()+1,0).getDate();
  const ultimo = `${prefixo}-${String(ultimoDia).padStart(2,"0")}`;

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    const [a,e,c] = await Promise.all([
      supabase.rpc("agenda_operacao_mes", { p_competencia: competencia }),
      supabase.from("eventos").select("*").gte("data",primeiro).lte("data",ultimo).order("data").order("hora"),
      supabase.from("clientes").select("id,nome,data_nascimento"),
    ]);
    const err=a.error||e.error||c.error; if(err)setErro(err.message);
    setAutomaticos((a.data as AutoItem[]|null)||[]);
    setEventos((e.data as Evento[]|null)||[]);
    setClientes((c.data as Cliente[]|null)||[]);
    setLoading(false);
  },[competencia,primeiro,ultimo]);

  useEffect(()=>{carregar();},[carregar]);

  const itens = useMemo<Item[]>(()=>{
    const out:Item[]=[...automaticos];
    for(const ev of eventos){ const info=tipoInfo(ev.tipo); out.push({id:`ev-${ev.id}`,data:ev.data,tipo:"evento",titulo:ev.titulo,detalhe:info.label,valor:null,status:ev.status,href:null,manual:true,evento:ev}); }
    const m=mes.getMonth()+1;
    for(const cl of clientes){ if(!cl.data_nascimento)continue; const [,mm,dd]=cl.data_nascimento.split("-"); if(Number(mm)!==m)continue; out.push({id:`aniv-${cl.id}`,data:`${mes.getFullYear()}-${mm}-${dd}`,tipo:"aniversario",titulo:`Aniversário • ${cl.nome}`,detalhe:"Cliente",valor:null,status:"info",href:"/dashboard/clientes"}); }
    for(const [data,nome] of feriadosDoAno(mes.getFullYear())){ if(data.startsWith(prefixo)) out.push({id:`fer-${data}`,data,tipo:"feriado",titulo:nome,detalhe:"Feriado nacional",valor:null,status:"info",href:null}); }
    return out.sort((a,b)=>a.data.localeCompare(b.data)||a.titulo.localeCompare(b.titulo));
  },[automaticos,eventos,clientes,mes,prefixo]);

  const porDia=useMemo(()=>{ const m=new Map<string,Item[]>(); for(const i of itens){const a=m.get(i.data)||[];a.push(i);m.set(i.data,a);} return m; },[itens]);
  const cells=useMemo(()=>{const first=new Date(mes.getFullYear(),mes.getMonth(),1);const arr:(Date|null)[]=[];for(let i=0;i<first.getDay();i++)arr.push(null);for(let d=1;d<=ultimoDia;d++)arr.push(new Date(mes.getFullYear(),mes.getMonth(),d));return arr;},[mes,ultimoDia]);
  const grupos=useMemo(()=>Array.from(porDia.entries()).sort(([a],[b])=>a.localeCompare(b)),[porDia]);
  const legenda=useMemo(()=>{const m=new Map<string,number>();for(const i of itens)m.set(i.tipo,(m.get(i.tipo)||0)+1);return Array.from(m.entries());},[itens]);
  const hoje=toISODate(new Date());
  const selecionados=diaSelecionado?porDia.get(diaSelecionado)||[]:[];

  function novo(data?:string){setEditando(null);setDataPadrao(data);setFormOpen(true);}
  function editar(item:Item){if(item.manual&&item.evento){setEditando(item.evento);setDataPadrao(undefined);setFormOpen(true);}}

  const calendario = <div className={`${compact?"":"rounded-[28px] border border-[#e8ecf4] bg-white p-4"}`}>
    <div className="grid grid-cols-7 gap-1">{DIAS.map(d=><div key={d} className="pb-2 text-center text-[10px] font-black text-[#94a3b8]">{d}</div>)}
      {cells.map((d,idx)=>{ if(!d)return <div key={idx} className={`${compact?"min-h-[48px]":"min-h-[118px]"} rounded-lg bg-[#fafbfc]`}/>; const iso=toISODate(d); const entries=porDia.get(iso)||[]; return <button key={iso} onClick={()=>setDiaSelecionado(iso)} className={`${compact?"min-h-[48px] py-1":"min-h-[118px] p-1.5"} rounded-xl border border-[#eef2f7] text-left transition hover:border-[#bfdbfe] hover:bg-[#f8fbff]`}>
        <div className="flex items-center justify-between"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${iso===hoje?"bg-[#2563eb] text-white":"text-[#334155]"}`}>{d.getDate()}</span>{!compact&&<span className="text-[10px] text-[#94a3b8]">{entries.length||""}</span>}</div>
        {compact?<div className="mt-1 flex flex-wrap gap-0.5">{entries.slice(0,4).map(e=><span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{backgroundColor:cores[e.tipo]||cores.evento}}/> )}</div>:<div className="mt-1 space-y-1">{entries.slice(0,4).map(e=><div key={e.id} className="flex items-center gap-1 overflow-hidden"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{backgroundColor:cores[e.tipo]||cores.evento}}/><span className="truncate text-[10px] font-semibold text-[#475569]">{e.titulo}</span></div>)}{entries.length>4&&<p className="text-[10px] text-[#94a3b8]">+{entries.length-4} mais</p>}</div>}
      </button>;})}
    </div>
  </div>;

  return <div className={compact?"flex h-full flex-col rounded-3xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]":"space-y-5"}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div>{!compact&&<><h1 className="text-2xl font-black text-[#0f172a]">Agenda da operação</h1><p className="text-sm text-[#64748b]">Vendas, compras, despesas, folha, cobranças e eventos em um único lugar.</p></>} {compact&&<h3 className="text-base font-black text-[#0f172a]">Resumo da agenda</h3>}</div>
      <div className="flex items-center gap-2">{!compact&&<div className="flex rounded-xl border border-[#e8ecf4] bg-white p-1"><button onClick={()=>setView("mes")} className={`rounded-lg px-3 py-2 text-xs font-bold ${view==="mes"?"bg-[#2563eb] text-white":"text-[#475569]"}`}><LayoutGrid className="mr-1 inline h-4 w-4"/>Mês</button><button onClick={()=>setView("lista")} className={`rounded-lg px-3 py-2 text-xs font-bold ${view==="lista"?"bg-[#2563eb] text-white":"text-[#475569]"}`}><List className="mr-1 inline h-4 w-4"/>Lista</button></div>}
        <button onClick={()=>setMes(new Date(mes.getFullYear(),mes.getMonth()-1,1))} className="rounded-lg p-2 text-[#64748b] hover:bg-[#f8fafc]"><ChevronLeft className="h-4 w-4"/></button><span className="min-w-[105px] text-center text-sm font-black text-[#0f172a]">{MESES[mes.getMonth()]} {mes.getFullYear()}</span><button onClick={()=>setMes(new Date(mes.getFullYear(),mes.getMonth()+1,1))} className="rounded-lg p-2 text-[#64748b] hover:bg-[#f8fafc]"><ChevronRight className="h-4 w-4"/></button>
        {!compact&&<button onClick={()=>novo()} className="rounded-xl bg-[#2563eb] px-3 py-2 text-xs font-black text-white"><Plus className="mr-1 inline h-4 w-4"/>Evento</button>}
      </div>
    </div>
    {erro&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
    {loading?<div className="rounded-2xl bg-[#f8fafc] p-5 text-sm text-[#64748b]">Carregando agenda...</div>:compact?calendario:view==="mes"?calendario:<div className="space-y-3">{grupos.length===0?<div className="rounded-2xl border border-[#e8ecf4] bg-white p-6 text-sm text-[#64748b]">Nenhuma movimentação neste mês.</div>:grupos.map(([data,arr])=><div key={data} className="rounded-[26px] border border-[#e8ecf4] bg-white p-5"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#2563eb]"/><h3 className="font-black text-[#0f172a]">{fmt(data)}</h3></div><div className="mt-3 space-y-2">{arr.map(item=><ItemLinha key={item.id} item={item} onEdit={()=>editar(item)}/>)}</div></div>)}</div>}
    <div className="flex flex-wrap gap-1.5">{legenda.map(([tipo,count])=><span key={tipo} className="flex items-center gap-1.5 rounded-full bg-[#f8fafc] px-2.5 py-1 text-[11px] font-bold text-[#475569]"><span className="h-2 w-2 rounded-full" style={{backgroundColor:cores[tipo]||cores.evento}}/>{labels[tipo]||tipo} {count}</span>)}</div>
    {compact&&<div className="mt-auto flex items-center justify-between border-t border-[#eef2f7] pt-4"><button onClick={()=>novo(hoje)} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-black text-white"><Plus className="mr-1 inline h-3.5 w-3.5"/>Evento</button><Link href="/dashboard/agenda" className="text-sm font-bold text-[#2563eb]">Ver agenda completa →</Link></div>}

    {diaSelecionado&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={()=>setDiaSelecionado(null)}><div className="max-h-[80vh] w-full max-w-xl overflow-auto rounded-t-[28px] bg-white p-5 sm:rounded-[28px]" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-[#64748b]">Movimentações do dia</p><h3 className="text-xl font-black text-[#0f172a]">{fmt(diaSelecionado)}</h3></div><button onClick={()=>setDiaSelecionado(null)} className="rounded-lg p-2 hover:bg-[#f8fafc]"><X className="h-5 w-5"/></button></div><div className="mt-4 space-y-2">{selecionados.length===0?<p className="rounded-2xl bg-[#f8fafc] p-4 text-sm text-[#64748b]">Nada registrado neste dia.</p>:selecionados.map(item=><ItemLinha key={item.id} item={item} onEdit={()=>editar(item)}/>)}</div><button onClick={()=>novo(diaSelecionado)} className="mt-4 w-full rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-sm font-black text-[#1d4ed8]"><Plus className="mr-1 inline h-4 w-4"/>Adicionar evento neste dia</button></div></div>}

    <EventoForm open={formOpen} onClose={()=>setFormOpen(false)} onSaved={()=>{setFormOpen(false);carregar();}} clientes={clientes.map(c=>({id:c.id,nome:c.nome}))} evento={editando} dataPadrao={dataPadrao}/>
  </div>;
}

function ItemLinha({item,onEdit}:{item:Item;onEdit:()=>void}){
  const corpo=<div className="flex items-start justify-between gap-3 rounded-2xl bg-[#f8fafc] p-3"><div className="flex min-w-0 gap-2"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor:cores[item.tipo]||cores.evento}}/><div className="min-w-0"><p className="text-sm font-black text-[#0f172a]">{item.titulo}</p>{item.detalhe&&<p className="mt-0.5 text-xs text-[#64748b]">{item.detalhe}</p>}<span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${["pago","recebido"].includes(item.status)?"bg-emerald-100 text-emerald-700":item.status==="atrasado"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{item.status.replaceAll("_"," ")}</span></div></div>{item.valor!==null&&<p className="shrink-0 text-sm font-black text-[#0f172a]">{brl(item.valor)}</p>}</div>;
  if(item.manual)return <button className="w-full text-left" onClick={onEdit}>{corpo}</button>;
  if(item.href)return <Link href={item.href} className="block">{corpo}</Link>;
  return corpo;
}
