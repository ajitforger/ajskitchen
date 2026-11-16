import { useState } from 'react';
import { ArrowRight, Calculator, CalendarClock, ChefHat, IndianRupee, Truck } from 'lucide-react';
import { APP_IMAGES } from '../data/southIndianSeeds';
import { signInWithGoogle } from '../firebase';
import { ResilientImage } from './ResilientImage';

export function AuthGate() {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to complete sign in.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones */}
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            Dakshin Ledger
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#modules" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Operations Suite
            </a>
            <a href="#costing" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Recipe Costing
            </a>
            <a href="#calculators" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Profit Calculators
            </a>
            <a href="#planner" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Batter Planner
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={signingIn}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {signingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Split */}
      <main id="top" className="flex-1">
        <section className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-medium text-emerald-700 tracking-wide mb-3">
                South Indian Restaurant Operations · Back-of-House Suite
              </p>
              <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 leading-[1.12] tracking-tight mb-5 text-balance font-display">
                Control every rupee from batter soak to banana leaf.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed mb-8 max-w-xl">
                Built specifically for South Indian tiffin centers, Sadhya kitchens, and filter coffee houses. Track vendor payables, engineer dish margins, balance your cash ledger, model daily profit, and coordinate overnight fermentation schedules in one persistent workspace.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={signingIn}
                  className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {signingIn ? 'Opening Workspace...' : 'Open Restaurant Workspace'}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500">
                  Pre-loaded with authentic South Indian recipes &amp; vendor templates
                </span>
              </div>

              {authError && (
                <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  {authError}
                </p>
              )}
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[320px] lg:min-h-[420px] rounded-xl overflow-hidden border border-slate-200 bg-white">
                <ResilientImage
                  src={APP_IMAGES.hero_spread.src}
                  alt="Authentic South Indian banana leaf meal with ghee roast masala dosa, idlis, chutneys, sambar, and brass filter coffee"
                  fallbackLabel="South Indian Culinary Spread"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-column feature strip below hero split */}
          <div id="modules" className="mt-14 pt-10 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div id="costing" className="bg-white border border-slate-200 rounded-xl p-6">
              <ChefHat className="w-5 h-5 text-emerald-700 mb-3" />
              <h2 className="text-base font-semibold text-slate-900 mb-1.5">Menu &amp; Recipe Costing</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Break down dosa batter, A2 ghee, sambar, and chutney portions to monitor exact plate food cost %.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <IndianRupee className="w-5 h-5 text-emerald-700 mb-3" />
              <h2 className="text-base font-semibold text-slate-900 mb-1.5">Money &amp; Vendor Ledger</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Track UPI, cash, aggregator payouts, dairy bills, rice mills, and vendor credit settlements.
              </p>
            </div>

            <div id="calculators" className="bg-white border border-slate-200 rounded-xl p-6">
              <Calculator className="w-5 h-5 text-emerald-700 mb-3" />
              <h2 className="text-base font-semibold text-slate-900 mb-1.5">Profit &amp; Yield Calculators</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Simulate daily sales, break-even covers, Sadhya catering quotes, and rice-dal wet batter yields.
              </p>
            </div>

            <div id="planner" className="bg-white border border-slate-200 rounded-xl p-6">
              <CalendarClock className="w-5 h-5 text-emerald-700 mb-3" />
              <h2 className="text-base font-semibold text-slate-900 mb-1.5">Fermentation &amp; Shift Planner</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Coordinate 14-hour batter soaking, grinding cycles, tawa seasoning, and morning coconut deliveries.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Dakshin Ledger · Back-of-House Restaurant Management</span>
          <span className="inline-flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" />
            Built for Tiffin Houses, Sadhya Kitchens &amp; Filter Coffee Bars
          </span>
        </div>
      </footer>
    </div>
  );
}
