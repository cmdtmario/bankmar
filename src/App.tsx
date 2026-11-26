import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { CalendarDays, CreditCard, Home, KeyRound, LogOut, Menu, Users } from 'lucide-react';
import { Painel } from './paginas/Painel';
import { supabase, configurado } from './lib/supabase';
import { semearSeVazio } from './lib/dados';
import { Login } from './paginas/Login';
const Mes = lazy(() => import('./paginas/Mes').then((m) => ({ default: m.Mes })));
const Contas = lazy(() => import('./paginas/Contas').then((m) => ({ default: m.Contas })));
const Faturas = lazy(() => import('./paginas/Faturas').then((m) => ({ default: m.Faturas })));
const Categorias = lazy(() => import('./paginas/Categorias').then((m) => ({ default: m.Categorias })));
const Mais = lazy(() => import('./paginas/Mais').then((m) => ({ default: m.Mais })));
const Compartilhado = lazy(() => import('./paginas/Compartilhado').then((m) => ({ default: m.Compartilhado })));
const Pessoas = lazy(() => import('./paginas/Pessoas').then((m) => ({ default: m.Pessoas })));
const PessoaDetalhe = lazy(() => import('./paginas/Pessoas').then((m) => ({ default: m.PessoaDetalhe })));
import { CadastrosProvider, Carregando } from './ui/comum';

// RF-03: só leva ao cofre; o sistema não lê nem guarda nada dele.
export const URL_COFRE = 'https://vault.bitwarden.com/';

function Area() {
  const [estado, setEstado] = useState<'verificando' | 'fora' | 'dentro'>('verificando');
  const loc = useLocation();
  useEffect(() => {
    const checar = async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setEstado(data?.currentLevel === 'aal2' ? 'dentro' : 'fora');
    };
    checar();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { checar(); });
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (estado === 'dentro') semearSeVazio().catch(() => {}); }, [estado]);
  if (estado === 'verificando') return <main><Carregando /></main>;
  // caso 13: qualquer rota sem login (e sem 2 etapas) vai para o login; nenhum dado é buscado antes
  if (estado === 'fora') return loc.pathname === '/' ? <Login onPronto={() => setEstado('dentro')} /> : <Navigate to="/" replace />;
  return (
    <CadastrosProvider>
      <header className="topo">
        <div className="marca"><img src="/monograma.png" alt="" /><span>BankMaR</span></div>
        <div className="linha">
          <a className="botao-link" href={URL_COFRE} target="_blank" rel="noopener noreferrer"><KeyRound size={17} aria-hidden="true" /> Cofre</a>
          <button className="icone" onClick={() => supabase.auth.signOut()} aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={loc.pathname.split('/')[1] || 'inicio'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
          <Suspense fallback={<main><Carregando /></main>}>
          <Routes location={loc}>
            <Route path="/" element={<Painel />} />
            <Route path="/mes" element={<Mes />} />
            <Route path="/contas" element={<Contas />} />
            <Route path="/faturas" element={<Faturas />} />
            <Route path="/pessoas" element={<Pessoas />} />
            <Route path="/pessoas/:id" element={<PessoaDetalhe />} />
            <Route path="/categorias" element={<Categorias />} />
            <Route path="/mais" element={<Mais />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
      <nav className="abas" aria-label="Navegação principal">
        <NavLink to="/" end><Home size={21} aria-hidden="true" /><span>Início</span></NavLink>
        <NavLink to="/mes"><CalendarDays size={21} aria-hidden="true" /><span>Mês</span></NavLink>
        <NavLink to="/faturas"><CreditCard size={21} aria-hidden="true" /><span>Faturas</span></NavLink>
        <NavLink to="/pessoas"><Users size={21} aria-hidden="true" /><span>Pessoas</span></NavLink>
        <NavLink to="/mais" className={({ isActive }) => (isActive || ['/contas', '/categorias'].includes(loc.pathname) ? 'active' : '')}><Menu size={21} aria-hidden="true" /><span>Mais</span></NavLink>
      </nav>
    </CadastrosProvider>
  );
}

export default function App() {
  if (!configurado) return <main><div className="erro">Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente.</div></main>;
  return (
    <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <Routes>
        <Route path="/c/:token" element={<Suspense fallback={null}><Compartilhado /></Suspense>} />
        <Route path="*" element={<Area />} />
      </Routes>
    </BrowserRouter>
    </MotionConfig>
  );
}
