// Navegação: menu lateral fixo no computador, gaveta (☰) no celular e barra inferior com os 4 destinos mais usados.
import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays, CreditCard, Home, Landmark, LineChart, Menu, PieChart, Plane, Receipt, Settings, Users, Wallet, X,
} from 'lucide-react';

type Item = { to: string; rotulo: string; icone: ReactNode; fim?: boolean };
export const SECOES: { titulo: string; itens: Item[] }[] = [
  { titulo: 'Dia a dia', itens: [
    { to: '/', rotulo: 'Início', icone: <Home size={19} />, fim: true },
    { to: '/mes', rotulo: 'Mês', icone: <CalendarDays size={19} /> },
    { to: '/faturas', rotulo: 'Faturas', icone: <Wallet size={19} /> },
    { to: '/contas', rotulo: 'Contas e boletos', icone: <Receipt size={19} /> },
    { to: '/pessoas', rotulo: 'Pessoas e divisões', icone: <Users size={19} /> },
  ] },
  { titulo: 'Patrimônio', itens: [
    { to: '/investimentos', rotulo: 'Investimentos', icone: <LineChart size={19} /> },
    { to: '/cartoes', rotulo: 'Cartões', icone: <CreditCard size={19} /> },
    { to: '/milhas', rotulo: 'Milhas e pontos', icone: <Plane size={19} /> },
  ] },
  { titulo: 'Relatórios', itens: [
    { to: '/categorias', rotulo: 'Gastos por categoria', icone: <PieChart size={19} /> },
    { to: '/ir', rotulo: 'Imposto de Renda', icone: <Landmark size={19} /> },
  ] },
  { titulo: '', itens: [{ to: '/mais', rotulo: 'Ajustes e importações', icone: <Settings size={19} /> }] },
];

function Lista({ aoEscolher }: { aoEscolher?: () => void }) {
  return (
    <>
      {SECOES.map((s, i) => (
        <div className="menu-secao" key={i}>
          {s.titulo && <div className="menu-titulo">{s.titulo}</div>}
          {s.itens.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.fim} className="menu-item" onClick={aoEscolher}>
              <span aria-hidden="true">{it.icone}</span>{it.rotulo}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  );
}

/** Menu lateral fixo (telas a partir de 1024 px). */
export function MenuLateral() {
  return <nav className="menu-lateral" aria-label="Menu principal"><Lista /></nav>;
}

/** Gaveta que desliza da esquerda (celular e tablet). Esc, toque fora ou escolher um item fecham. */
export function Gaveta({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const painel = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => { onFechar(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!aberta) return;
    const anterior = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    painel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
      if (e.key === 'Tab' && painel.current) { // foco fica dentro da gaveta
        const f = [...painel.current.querySelectorAll<HTMLElement>('a, button')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', tecla);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', tecla); anterior?.focus?.(); };
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="gaveta-fundo" onClick={onFechar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <motion.div ref={painel} className="gaveta" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}>
            <div className="gaveta-topo">
              <span className="marca-texto">BankMaR</span>
              <button className="icone" onClick={onFechar} aria-label="Fechar menu"><X size={20} /></button>
            </div>
            <nav aria-label="Menu principal"><Lista aoEscolher={onFechar} /></nav>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Barra inferior do celular: os 4 destinos mais usados + Menu (abre a gaveta). */
export function BarraInferior({ onMenu, menuAtivo }: { onMenu: () => void; menuAtivo: boolean }) {
  return (
    <nav className="abas" aria-label="Atalhos">
      <NavLink to="/" end><Home size={21} aria-hidden="true" /><span>Início</span></NavLink>
      <NavLink to="/mes"><CalendarDays size={21} aria-hidden="true" /><span>Mês</span></NavLink>
      <NavLink to="/faturas"><Wallet size={21} aria-hidden="true" /><span>Faturas</span></NavLink>
      <NavLink to="/investimentos"><LineChart size={21} aria-hidden="true" /><span>Investir</span></NavLink>
      <button type="button" onClick={onMenu} className={menuAtivo ? 'active' : ''} aria-haspopup="dialog"><Menu size={21} aria-hidden="true" /><span>Menu</span></button>
    </nav>
  );
}

export const ROTAS_BARRA = ['/', '/mes', '/faturas', '/investimentos'];
export { Menu as IconeMenu };
