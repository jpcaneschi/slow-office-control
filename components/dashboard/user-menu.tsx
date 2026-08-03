"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  User,
  Settings,
  LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

function iniciais(nome: string) {
  return (
    nome
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function UserMenu() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email || "");
      setNome((u.user_metadata?.nome as string) || u.email || "Usuário");

      const { data: prof } = await supabase
        .from("profiles")
        .select("nome, avatar_url")
        .eq("id", u.id)
        .maybeSingle();
      if (prof?.nome) setNome(prof.nome);
      if (prof?.avatar_url) setAvatarUrl(prof.avatar_url);
    });
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  async function sair() {
    setSaindo(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const itens = [
    { label: "Meu perfil", icon: User, href: "/dashboard/configuracoes" },
    { label: "Configurações", icon: Settings, href: "/dashboard/configuracoes" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-xl border border-[#e8ecf4] bg-white py-1.5 pl-1.5 pr-3 transition hover:bg-[#f4f6fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="Foto de perfil"
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1e40af] to-[#2563eb] text-sm font-bold text-white">
            {iniciais(nome || "?")}
          </span>
        )}
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-sm font-bold text-[#0f172a]">
            {nome || "…"}
          </span>
          <span className="block max-w-[140px] truncate text-xs text-[#64748b]">
            {email}
          </span>
        </span>
        <ChevronDown
          className={`hidden h-4 w-4 text-[#94a3b8] transition-transform sm:block ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white py-1 shadow-[0_16px_44px_rgba(15,23,42,0.16)]"
        >
          <div className="border-b border-[#eef2f7] px-4 py-3 sm:hidden">
            <p className="truncate text-sm font-bold text-[#0f172a]">{nome}</p>
            <p className="truncate text-xs text-[#64748b]">{email}</p>
          </div>

          {itens.map((it) => {
            const Icon = it.icon;
            return (
              <Link
                key={it.label}
                href={it.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
              >
                <Icon className="h-4 w-4 text-[#64748b]" />
                {it.label}
              </Link>
            );
          })}

          <div className="my-1 border-t border-[#eef2f7]" />

          <button
            onClick={sair}
            disabled={saindo}
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2] disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {saindo ? "Saindo…" : "Sair"}
          </button>
        </div>
      )}
    </div>
  );
}
