import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Calculator,
  CalendarClock,
  ChefHat,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Receipt,
  Settings,
  Truck,
  X,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { CalculatorsModule } from './components/CalculatorsModule';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MenuModule } from './components/MenuModule';
import { MoneyModule } from './components/MoneyModule';
import { OverviewModule } from './components/OverviewModule';
import { PlannerModule } from './components/PlannerModule';
import { PosModule } from './components/PosModule';
import { ResilientImage } from './components/ResilientImage';
import { VendorsModule } from './components/VendorsModule';
import {
  APP_IMAGES,
  createSeedLedgerEntries,
  createSeedMenuItems,
  createSeedPlannerTasks,
  createSeedScenarios,
  createSeedVendors,
} from './data/southIndianSeeds';
import { auth, db, handleFirestoreError, OperationType, signOutUser } from './firebase';
import type {
  CalcScenario,
  CurrencyCode,
  LedgerEntry,
  MenuItem,
  NavSection,
  PlannerTask,
  PosOrder,
  UserProfile,
  Vendor,
} from './types';
import { clampStr } from './utils/format';

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'pos', label: 'POS & KOT', icon: Receipt },
  { id: 'menu', label: 'Menu & Costing', icon: ChefHat },
  { id: 'money', label: 'Money Ledger', icon: IndianRupee },
  { id: 'vendors', label: 'Vendors', icon: Truck },
  { id: 'calculators', label: 'Calculators', icon: Calculator },
  { id: 'planner', label: 'Kitchen Planner', icon: CalendarClock },
];

function WorkspaceShell() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [plannerTasks, setPlannerTasks] = useState<PlannerTask[]>([]);
  const [scenarios, setScenarios] = useState<CalcScenario[]>([]);
  const [posOrders, setPosOrders] = useState<PosOrder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restNameInput, setRestNameInput] = useState('');
  const [currencyInput, setCurrencyInput] = useState<CurrencyCode>('INR');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Bootstrap user profile & starter South Indian dataset on first login
  useEffect(() => {
    if (!authReady || !user) {
      setProfile(null);
      setDataLoading(false);
      return;
    }

    let cancelled = false;

    async function ensureWorkspaceSeeded(currentUser: User) {
      const userRef = doc(db, 'users', currentUser.uid);
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const batch = writeBatch(db);
          const ownerName = clampStr(currentUser.displayName || 'Restaurant Owner', 100) || 'Owner';
          batch.set(userRef, {
            uid: currentUser.uid,
            restaurantName: 'Dakshin Kitchen & Filter Coffee',
            ownerName,
            currency: 'INR',
            seededDefaults: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          for (const item of createSeedMenuItems(currentUser.uid)) {
            batch.set(doc(collection(db, 'menuItems')), {
              ...item,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          for (const v of createSeedVendors(currentUser.uid)) {
            batch.set(doc(collection(db, 'vendors')), {
              ...v,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          for (const l of createSeedLedgerEntries(currentUser.uid)) {
            batch.set(doc(collection(db, 'ledgerEntries')), {
              ...l,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          for (const t of createSeedPlannerTasks(currentUser.uid)) {
            batch.set(doc(collection(db, 'plannerTasks')), {
              ...t,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          for (const sc of createSeedScenarios(currentUser.uid)) {
            batch.set(doc(collection(db, 'calcScenarios')), {
              ...sc,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        }
      } catch (error) {
        if (!cancelled) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
    }

    ensureWorkspaceSeeded(user);

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setProfile(data);
          setRestNameInput(data.restaurantName);
          setCurrencyInput(data.currency);
        }
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    );

    const unsubMenu = onSnapshot(
      query(collection(db, 'menuItems'), where('ownerId', '==', user.uid)),
      (snap) => {
        setMenuItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'menuItems')
    );

    const unsubVendors = onSnapshot(
      query(collection(db, 'vendors'), where('ownerId', '==', user.uid)),
      (snap) => {
        setVendors(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vendor, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'vendors')
    );

    const unsubLedger = onSnapshot(
      query(collection(db, 'ledgerEntries'), where('ownerId', '==', user.uid)),
      (snap) => {
        setLedgerEntries(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LedgerEntry, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'ledgerEntries')
    );

    const unsubPlanner = onSnapshot(
      query(collection(db, 'plannerTasks'), where('ownerId', '==', user.uid)),
      (snap) => {
        setPlannerTasks(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlannerTask, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'plannerTasks')
    );

    const unsubScenarios = onSnapshot(
      query(collection(db, 'calcScenarios'), where('ownerId', '==', user.uid)),
      (snap) => {
        setScenarios(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CalcScenario, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'calcScenarios')
    );

    const unsubPosOrders = onSnapshot(
      query(collection(db, 'posOrders'), where('ownerId', '==', user.uid)),
      (snap) => {
        setPosOrders(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PosOrder, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posOrders')
    );

    return () => {
      cancelled = true;
      unsubProfile();
      unsubMenu();
      unsubVendors();
      unsubLedger();
      unsubPlanner();
      unsubScenarios();
      unsubPosOrders();
    };
  }, [authReady, user]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const cleanName = clampStr(restNameInput, 120) || 'Dakshin Kitchen';
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        restaurantName: cleanName,
        ownerName: profile.ownerName,
        currency: currencyInput,
        updatedAt: serverTimestamp(),
      });
      setSettingsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setSavingSettings(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-500">Loading workspace...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  const currency: CurrencyCode = profile?.currency || 'INR';
  const restaurantName = profile?.restaurantName || 'Dakshin Kitchen & Filter Coffee';
  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeSection)?.label || 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-white border-r border-slate-200 shrink-0">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
            Dakshin Ledger
          </div>
          <div className="text-xs text-slate-500 truncate mt-0.5">{restaurantName}</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-700' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            Workspace Settings ({currency})
          </button>
          <button
            type="button"
            onClick={() => signOutUser()}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50/60 rounded-lg cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-slate-400" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-lg font-bold font-display text-slate-900">Dakshin Ledger</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      active ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  setSettingsOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700"
              >
                <Settings className="w-4 h-4" />
                Settings ({currency})
              </button>
              <button
                type="button"
                onClick={() => signOutUser()}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-700"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Contextual Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Open navigation"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span>{restaurantName}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-900">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-500">
              {user.displayName || user.email}
            </span>
            <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 shrink-0">
              <ResilientImage
                src={user.photoURL || APP_IMAGES.avatar_manager.src}
                alt={user.displayName || 'Operations Manager'}
                fallbackLabel="OM"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {dataLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-44 bg-white border border-slate-200 rounded-xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="h-28 bg-white border border-slate-200 rounded-xl" />
                <div className="h-28 bg-white border border-slate-200 rounded-xl" />
                <div className="h-28 bg-white border border-slate-200 rounded-xl" />
                <div className="h-28 bg-white border border-slate-200 rounded-xl" />
              </div>
              <div className="h-80 bg-white border border-slate-200 rounded-xl" />
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <OverviewModule
                  restaurantName={restaurantName}
                  currency={currency}
                  menuItems={menuItems}
                  vendors={vendors}
                  ledgerEntries={ledgerEntries}
                  plannerTasks={plannerTasks}
                  onNavigate={setActiveSection}
                />
              )}
              {activeSection === 'pos' && (
                <PosModule
                  ownerId={user.uid}
                  restaurantName={restaurantName}
                  currency={currency}
                  menuItems={menuItems}
                  posOrders={posOrders}
                />
              )}
              {activeSection === 'menu' && (
                <MenuModule ownerId={user.uid} currency={currency} menuItems={menuItems} />
              )}
              {activeSection === 'money' && (
                <MoneyModule
                  ownerId={user.uid}
                  currency={currency}
                  ledgerEntries={ledgerEntries}
                  vendors={vendors}
                />
              )}
              {activeSection === 'vendors' && (
                <VendorsModule ownerId={user.uid} currency={currency} vendors={vendors} />
              )}
              {activeSection === 'calculators' && (
                <CalculatorsModule
                  ownerId={user.uid}
                  currency={currency}
                  scenarios={scenarios}
                />
              )}
              {activeSection === 'planner' && (
                <PlannerModule ownerId={user.uid} plannerTasks={plannerTasks} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Workspace Preferences</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Restaurant Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={restNameInput}
                  onChange={(e) => setRestNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Display Currency
                </label>
                <select
                  value={currencyInput}
                  onChange={(e) => setCurrencyInput(e.target.value as CurrencyCode)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="INR">Indian Rupee (₹ INR)</option>
                  <option value="USD">US Dollar ($ USD)</option>
                </select>
              </div>
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceShell />
    </ErrorBoundary>
  );
}
