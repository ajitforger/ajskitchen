import {
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  ChefHat,
  Clock,
  IndianRupee,
  Receipt,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { APP_IMAGES } from '../data/southIndianSeeds';
import type {
  CurrencyCode,
  LedgerEntry,
  MenuItem,
  NavSection,
  PlannerTask,
  Vendor,
} from '../types';
import { formatDateShort, formatMoney, formatPercent } from '../utils/format';
import { ResilientImage } from './ResilientImage';

interface OverviewModuleProps {
  restaurantName: string;
  currency: CurrencyCode;
  menuItems: MenuItem[];
  vendors: Vendor[];
  ledgerEntries: LedgerEntry[];
  plannerTasks: PlannerTask[];
  onNavigate: (section: NavSection) => void;
}

export function OverviewModule({
  restaurantName,
  currency,
  menuItems,
  vendors,
  ledgerEntries,
  plannerTasks,
  onNavigate,
}: OverviewModuleProps) {
  const validEntries = ledgerEntries.filter((e) => e.status !== 'voided');
  const totalInflow = validEntries
    .filter((e) => e.entryType === 'income')
    .reduce((sum, e) => sum + e.amount, 0);
  const totalOutflow = validEntries
    .filter((e) => e.entryType === 'expense')
    .reduce((sum, e) => sum + e.amount, 0);
  const netCashFlow = totalInflow - totalOutflow;

  const activeVendors = vendors.filter((v) => v.status !== 'archived');
  const totalPayables = activeVendors.reduce((sum, v) => sum + v.outstandingBalance, 0);

  const activeMenu = menuItems.filter((m) => m.status !== 'archived');
  const avgFoodCostPct =
    activeMenu.length > 0
      ? activeMenu.reduce((sum, m) => {
          const totalCost = m.recipeCost + m.packagingCost;
          return sum + (m.sellingPrice > 0 ? (totalCost / m.sellingPrice) * 100 : 0);
        }, 0) / activeMenu.length
      : 0;

  const estMonthlyMenuGrossProfit = activeMenu.reduce((sum, m) => {
    const unitMargin = m.sellingPrice - (m.recipeCost + m.packagingCost);
    return sum + unitMargin * m.monthlyUnits;
  }, 0);

  // Top 5 dishes by estimated monthly gross profit contribution
  const topDishes = [...activeMenu]
    .map((m) => {
      const totalUnitCost = m.recipeCost + m.packagingCost;
      const unitMargin = m.sellingPrice - totalUnitCost;
      const foodCostPct = m.sellingPrice > 0 ? (totalUnitCost / m.sellingPrice) * 100 : 0;
      const monthlyProfit = unitMargin * m.monthlyUnits;
      return { ...m, unitMargin, foodCostPct, monthlyProfit };
    })
    .sort((a, b) => b.monthlyProfit - a.monthlyProfit)
    .slice(0, 5);

  // Category expense breakdown for bar chart
  const expenseByCategory = validEntries
    .filter((e) => e.entryType === 'expense')
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});

  const expenseCategoriesSorted = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxExpenseCat = expenseCategoriesSorted[0]?.[1] || 1;

  // Upcoming / active kitchen tasks
  const activeTasks = plannerTasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Operational Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-8 p-6 lg:p-8 flex flex-col justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-emerald-700 mb-2">
              {restaurantName} · Full-Stack Restaurant &amp; Kitchen Control
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 font-display tracking-tight text-balance">
              South Indian Operations &amp; Margin Pulse
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
              Manage live POS billing and kitchen KOTs alongside cash flow, vendor payables, recipe food costs across dosas, idlis, Sadhya meals, and filter coffee, plus daily batter prep schedules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Receipt className="w-4 h-4" />
              Open POS &amp; KOT
            </button>
            <button
              type="button"
              onClick={() => onNavigate('money')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <IndianRupee className="w-4 h-4 text-slate-600" />
              Log Money Entry
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calculators')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Calculator className="w-4 h-4 text-slate-600" />
              Open Profit Calculators
            </button>
            <button
              type="button"
              onClick={() => onNavigate('planner')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Clock className="w-4 h-4 text-slate-600" />
              Kitchen Planner ({activeTasks.length} pending)
            </button>
          </div>
        </div>

        <div className="lg:col-span-4 min-h-[200px] border-t lg:border-t-0 lg:border-l border-slate-200">
          <ResilientImage
            src={APP_IMAGES.hero_spread.src}
            alt="South Indian tiffin and banana leaf meal spread"
            fallbackLabel="South Indian Menu Showcase"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Net Logged Cash Flow</span>
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          </div>
          <div className={`text-2xl font-bold font-mono tabular-nums ${netCashFlow >= 0 ? 'text-slate-900' : 'text-red-700'}`}>
            {formatMoney(netCashFlow, currency)}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Inflow {formatMoney(totalInflow, currency)} · Out {formatMoney(totalOutflow, currency)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Est. Monthly Menu Margin</span>
            <ChefHat className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatMoney(estMonthlyMenuGrossProfit, currency)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Across {activeMenu.length} active South Indian dishes
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Avg Recipe Food Cost</span>
            <span className={`text-xs font-medium ${avgFoodCostPct <= 32 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {avgFoodCostPct <= 32 ? 'Target Optimal' : 'Margin Watch'}
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatPercent(avgFoodCostPct)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Benchmark target: 26%–32% including packaging
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Vendor Payables Due</span>
            <Truck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatMoney(totalPayables, currency)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {activeVendors.filter((v) => v.outstandingBalance > 0).length} suppliers awaiting settlement
          </div>
        </div>
      </div>

      {/* Main Split: Menu Profit Leaders + Expense Breakdown & Kitchen Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Top Margin Dishes Table */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Top Margin South Indian Dishes</h2>
              <p className="text-xs text-slate-500">Ranked by monthly gross contribution (Selling Price minus Recipe + Leaf/Box Cost)</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('menu')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              View Menu
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50/60">
                  <th className="text-left font-medium px-6 py-3">Dish</th>
                  <th className="text-right font-medium px-4 py-3">Price</th>
                  <th className="text-right font-medium px-4 py-3">Food Cost %</th>
                  <th className="text-right font-medium px-4 py-3">Units/Mo</th>
                  <th className="text-right font-medium px-6 py-3">Monthly Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {topDishes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                      No active menu items yet. Add dishes in Menu &amp; Costing.
                    </td>
                  </tr>
                ) : (
                  topDishes.map((dish) => (
                    <tr key={dish.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-slate-900">{dish.name}</div>
                        <div className="text-xs text-slate-500">
                          {dish.category} · {dish.regionalName || 'House Recipe'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900">
                        {formatMoney(dish.sellingPrice, currency)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        <span className={dish.foodCostPct <= 30 ? 'text-emerald-700 font-medium' : dish.foodCostPct <= 36 ? 'text-amber-700 font-medium' : 'text-red-700 font-medium'}>
                          {formatPercent(dish.foodCostPct)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-600">
                        {dish.monthlyUnits.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatMoney(dish.monthlyProfit, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Expense Allocation + Kitchen Prep Queue */}
        <div className="xl:col-span-5 space-y-6">
          {/* Expense Breakdown Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Expense Allocation</h2>
                <p className="text-xs text-slate-500">Logged outflow by operational category</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('money')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                Open Ledger
              </button>
            </div>

            {expenseCategoriesSorted.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No expenses logged yet.</p>
            ) : (
              <div className="space-y-3.5">
                {expenseCategoriesSorted.map(([cat, amount]) => {
                  const widthPct = Math.max(8, Math.round((amount / maxExpenseCat) * 100));
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium text-slate-700">{cat}</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatMoney(amount, currency)}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 rounded-sm transition-all duration-300"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming Kitchen & Batter Tasks */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Active Kitchen &amp; Batter Queue</h2>
                <p className="text-xs text-slate-500">Next scheduled soaking, prep, and vendor drops</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('planner')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap shrink-0"
              >
                Planner
              </button>
            </div>

            <div className="divide-y divide-slate-200">
              {activeTasks.length === 0 ? (
                <div className="px-6 py-6 text-sm text-slate-500 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  All scheduled kitchen tasks are completed.
                </div>
              ) : (
                activeTasks.map((task) => (
                  <div key={task.id} className="px-6 py-3.5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{task.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {task.station} · {task.assignee || 'Unassigned'} · {formatDateShort(task.scheduledDate)} {task.scheduledTime}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                        task.status === 'in_progress' ? 'text-amber-700' : 'text-slate-600'
                      }`}
                    >
                      {task.status === 'in_progress' ? 'In Progress' : 'Planned'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
