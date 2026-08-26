from pathlib import Path

p = Path('app/dashboard/clientes/[id]/page.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace(
'import { PageHeader } from "@/components/dashboard/page-header";\n',
'import { PageHeader } from "@/components/dashboard/page-header";\nimport { EntityTimeline, type TimelineItem } from "@/components/dashboard/entity-timeline";\n'
)

s = s.replace(
'  const [tatuagens, setTatuagens] = useState<Tatuagem[]>([]);\n  const [loading, setLoading] = useState(true);',
'  const [tatuagens, setTatuagens] = useState<Tatuagem[]>([]);\n  const [timeline, setTimeline] = useState<TimelineItem[]>([]);\n  const [loading, setLoading] = useState(true);'
)

s = s.replace(
'      const [vRes, pRes, cRes, sRes, tRes] = await Promise.all([',
'      const [vRes, pRes, cRes, sRes, tRes, timelineRes] = await Promise.all(['
)

needle = '''        supabase
          .from("tatuagem_atendimentos")
          .select("id, descricao, tatuador, valor, data")
          .eq("cliente_id", clienteId)
          .order("data", { ascending: false }),
      ]);'''
repl = '''        supabase
          .from("tatuagem_atendimentos")
          .select("id, descricao, tatuador, valor, data")
          .eq("cliente_id", clienteId)
          .order("data", { ascending: false }),
        supabase.rpc("timeline_cliente", { p_cliente_id: clienteId }),
      ]);'''
assert needle in s, 'promise needle not found'
s = s.replace(needle, repl)

s = s.replace(
'      setTatuagens(tRes.data || []);\n\n      const ids =',
'      setTatuagens(tRes.data || []);\n      setTimeline((timelineRes.data as TimelineItem[] | null) || []);\n\n      const ids ='
)

marker = '''      <div className="grid gap-6 xl:grid-cols-2">'''
insert = '''      <div>
        <div className="mb-3">
          <h2 className="text-lg font-black text-[#0f172a]">Linha do tempo</h2>
          <p className="text-sm text-[#64748b]">
            Compras, pagamentos, promissórias, condicionais e atendimentos em uma única sequência cronológica.
          </p>
        </div>
        <EntityTimeline items={timeline} vazio="Este cliente ainda não possui movimentações." />
      </div>

      <div className="border-t border-[#e8ecf4] pt-2">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#94a3b8]">Detalhes por tipo</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">'''
assert marker in s, 'grid marker not found'
s = s.replace(marker, insert, 1)

p.write_text(s, encoding='utf-8')
print('cliente timeline patched')
