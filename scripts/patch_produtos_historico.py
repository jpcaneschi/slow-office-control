from pathlib import Path
p=Path('app/dashboard/produtos/page.tsx')
s=p.read_text(encoding='utf-8')

s=s.replace('import { useEffect, useMemo, useState } from "react";\n', 'import { useEffect, useMemo, useState } from "react";\nimport Link from "next/link";\n')
s=s.replace('''    if (e === "critico" || e === "baixo") setFiltroEstoque("baixo");
    else if (e === "zerado") setFiltroEstoque("zerado");''','''    if (e === "critico") setFiltroEstoque("critico");
    else if (e === "baixo") setFiltroEstoque("baixo");
    else if (e === "zerado") setFiltroEstoque("zerado");''')
s=s.replace('''          : filtroEstoque === "zerado"
          ? estoqueAtual === 0
          : filtroEstoque === "baixo"
          ? estoqueAtual > 0 && estoqueAtual <= 3''','''          : filtroEstoque === "zerado"
          ? estoqueAtual === 0
          : filtroEstoque === "critico"
          ? estoqueAtual <= 2
          : filtroEstoque === "baixo"
          ? estoqueAtual > 0 && estoqueAtual <= 3''')
s=s.replace('''  const produtosCriticos = useMemo(() => {
    return produtos
      .filter((produto) => estoqueEfetivo(produto) <= 3)''','''  const produtosCriticos = useMemo(() => {
    return produtos
      .filter((produto) => estoqueEfetivo(produto) <= 2)''')
s=s.replace('''                  <option value="zerado">Estoque zerado</option>
                  <option value="baixo">Estoque baixo</option>''','''                  <option value="zerado">Estoque zerado</option>
                  <option value="critico">Crítico (até 2)</option>
                  <option value="baixo">Estoque baixo (até 3)</option>''')
needle='''                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editarProduto(produto)}'''
repl='''                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/dashboard/produtos/${produto.id}`}
                            className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-2 text-sm font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe]"
                          >
                            Histórico
                          </Link>
                          <button
                            type="button"
                            onClick={() => editarProduto(produto)}'''
assert needle in s
s=s.replace(needle,repl,1)
p.write_text(s,encoding='utf-8')
print('patched')
