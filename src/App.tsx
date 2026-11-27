import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { KeyRound, LogOut, Menu } from 'lucide-react';
import { BarraInferior, Gaveta, MenuLateral, ROTAS_BARRA } from './ui/Navegacao';
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
const Cartoes = lazy(() => import('./paginas/Cartoes').then((m) => ({ default: m.Cartoes })));
const Milhas = lazy(() => import('./paginas/Milhas').then((m) => ({ default: m.Milhas })));
const ImpostoRenda = lazy(() => import('./paginas/ImpostoRenda').then((m) => ({ default: m.ImpostoRenda })));
const Investimentos = lazy(() => import('./paginas/Investimentos').then((m) => ({ default: m.Investimentos })));
const Pessoas = lazy(() => import('./paginas/Pessoas').then((m) => ({ default: m.Pessoas })));
const PessoaDetalhe = lazy(() => import('./paginas/Pessoas').then((m) => ({ default: m.PessoaDetalhe })));
import { CadastrosProvider, Carregando } from './ui/comum';

// O arquivo de demonstração abre sem servidor, então usa rotas com #.
const Roteador = import.meta.env.VITE_DEMO ? HashRouter : BrowserRouter;

// RF-03: só leva ao cofre; o sistema não lê nem guarda nada dele.
export const URL_COFRE = 'https://vault.bitwarden.com/';

function Area() {
  const [estado, setEstado] = useState<'verificando' | 'fora' | 'dentro'>('verificando');
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
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
      {import.meta.env.VITE_DEMO && <div className="faixa-demo">Demonstração com dados fictícios · nada é salvo</div>}
      <header className="topo">
        <button className="icone so-gaveta" onClick={() => setMenu(true)} aria-label="Abrir menu" aria-haspopup="dialog" aria-expanded={menu}><Menu size={20} /></button>
        <div className="marca"><img src={`${import.meta.env.BASE_URL}monograma.png`} alt="" /><span>BankMaR</span></div>
        <div className="linha">
          <a className="botao-link" href={URL_COFRE} target="_blank" rel="noopener noreferrer"><KeyRound size={17} aria-hidden="true" /> Cofre</a>
          <button className="icone" onClick={() => supabase.auth.signOut()} aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </header>
      <Gaveta aberta={menu} onFechar={() => setMenu(false)} />
      <MenuLateral />
      <div className="conteudo">
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
            <Route path="/investimentos" element={<Investimentos />} />
            <Route path="/cartoes" element={<Cartoes />} />
            <Route path="/milhas" element={<Milhas />} />
            <Route path="/ir" element={<ImpostoRenda />} />
            <Route path="/mais" element={<Mais />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
      </div>
      <BarraInferior onMenu={() => setMenu(true)} menuAtivo={!ROTAS_BARRA.includes(loc.pathname)} />
    </CadastrosProvider>
  );
}

export default function App() {
  if (!configurado) return <main><div className="erro">Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente.</div></main>;
  return (
    <MotionConfig reducedMotion="user">
    <Roteador>
      <Routes>
        <Route path="/c/:token" element={<Suspense fallback={null}><Compartilhado /></Suspense>} />
        <Route path="*" element={<Area />} />
      </Routes>
    </Roteador>
    </MotionConfig>
  );
}
