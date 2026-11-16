import { useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { CalcScenario, CalculatorType, CurrencyCode } from '../types';
import { clampNum, clampStr, formatMoney, formatPercent } from '../utils/format';

interface CalculatorsModuleProps {
  ownerId: string;
  currency: CurrencyCode;
  scenarios: CalcScenario[];
}

const CALC_TABS: CalculatorType[] = [
  'Daily Profit',
  'Break-Even',
  'Menu Pricing',
  'Catering Quote',
  'Batter Yield',
];

export function CalculatorsModule({
  ownerId,
  currency,
  scenarios,
}: CalculatorsModuleProps) {
  const [activeTab, setActiveTab] = useState<CalculatorType>('Daily Profit');
  const [scenarioName, setScenarioName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // 1. Daily Profit Simulator
  const [dineInCovers, setDineInCovers] = useState(260);
  const [avgTicket, setAvgTicket] = useState(165);
  const [cateringDaily, setCateringDaily] = useState(9500);
  const [aggregatorGross, setAggregatorGross] = useState(12000);
  const [aggregatorFeePct, setAggregatorFeePct] = useState(22);
  const [foodCostPct, setFoodCostPct] = useState(28);
  const [laborPct, setLaborPct] = useState(21);
  const [dailyFixedOverhead, setDailyFixedOverhead] = useState(8500);
  const [wastagePct, setWastagePct] = useState(2.5);

  const dineInGross = dineInCovers * avgTicket;
  const totalGrossSales = dineInGross + cateringDaily + aggregatorGross;
  const aggregatorFees = (aggregatorGross * aggregatorFeePct) / 100;
  const netRealizedRevenue = totalGrossSales - aggregatorFees;
  const totalFoodCost = (totalGrossSales * (foodCostPct + wastagePct)) / 100;
  const totalLaborCost = (totalGrossSales * laborPct) / 100;
  const primeCostPct =
    netRealizedRevenue > 0 ? ((totalFoodCost + totalLaborCost) / netRealizedRevenue) * 100 : 0;
  const dailyNetProfit =
    netRealizedRevenue - totalFoodCost - totalLaborCost - dailyFixedOverhead;
  const dailyNetMargin = netRealizedRevenue > 0 ? (dailyNetProfit / netRealizedRevenue) * 100 : 0;

  // 2. Break-Even & Cover Target
  const [monthlyRent, setMonthlyRent] = useState(115000);
  const [monthlyPayroll, setMonthlyPayroll] = useState(165000);
  const [monthlyUtilities, setMonthlyUtilities] = useState(42000);
  const [monthlyOtherFixed, setMonthlyOtherFixed] = useState(28000);
  const [beVariableCostPct, setBeVariableCostPct] = useState(35);
  const [beAvgCheck, setBeAvgCheck] = useState(170);

  const totalMonthlyFixed = monthlyRent + monthlyPayroll + monthlyUtilities + monthlyOtherFixed;
  const contributionRatio = Math.max(0.05, 1 - beVariableCostPct / 100);
  const monthlyBreakEvenRev = totalMonthlyFixed / contributionRatio;
  const dailyBreakEvenRev = monthlyBreakEvenRev / 30;
  const requiredDailyCovers = beAvgCheck > 0 ? Math.ceil(dailyBreakEvenRev / beAvgCheck) : 0;

  // 3. Menu Pricing & Margin
  const [dishPlateCost, setDishPlateCost] = useState(34.5);
  const [dishPackCost, setDishPackCost] = useState(6);
  const [targetFoodCostPct, setTargetFoodCostPct] = useState(28);
  const [gstPct, setGstPct] = useState(5);

  const totalDishCost = dishPlateCost + dishPackCost;
  const recommendedBasePrice =
    targetFoodCostPct > 0 ? totalDishCost / (targetFoodCostPct / 100) : totalDishCost;
  const priceWithGst = recommendedBasePrice * (1 + gstPct / 100);
  const dishGrossProfit = recommendedBasePrice - totalDishCost;

  // 4. Catering / Sadhya Quote
  const [guestCount, setGuestCount] = useState(150);
  const [foodPerPlateCost, setFoodPerPlateCost] = useState(98);
  const [leafAndConsumableCost, setLeafAndConsumableCost] = useState(14);
  const [staffAndTransport, setStaffAndTransport] = useState(8500);
  const [targetEventMarginPct, setTargetEventMarginPct] = useState(35);

  const eventDirectCost =
    guestCount * (foodPerPlateCost + leafAndConsumableCost) + staffAndTransport;
  const eventQuoteTotal =
    targetEventMarginPct < 95 ? eventDirectCost / (1 - targetEventMarginPct / 100) : eventDirectCost;
  const eventPerPlateQuote = guestCount > 0 ? eventQuoteTotal / guestCount : 0;
  const eventNetProfit = eventQuoteTotal - eventDirectCost;

  // 5. Batter & Prep Yield (South Indian Kitchen Essential)
  const [riceKg, setRiceKg] = useState(30);
  const [riceCostPerKg, setRiceCostPerKg] = useState(54);
  const [uradKg, setUradKg] = useState(8);
  const [uradCostPerKg, setUradCostPerKg] = useState(138);
  const [fenugreekSaltCost, setFenugreekSaltCost] = useState(95);
  const [waterMultiplier, setWaterMultiplier] = useState(1.85);
  const [portionGrams, setPortionGrams] = useState(175);

  const dryGrainKg = riceKg + uradKg;
  const wetBatterKg = dryGrainKg * waterMultiplier;
  const totalPortions = portionGrams > 0 ? Math.floor((wetBatterKg * 1000) / portionGrams) : 0;
  const totalGrainCost = riceKg * riceCostPerKg + uradKg * uradCostPerKg + fenugreekSaltCost;
  const costPerKgBatter = wetBatterKg > 0 ? totalGrainCost / wetBatterKg : 0;
  const costPerPortion = totalPortions > 0 ? totalGrainCost / totalPortions : 0;

  const handleSaveScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(scenarioName, 120);
    if (!cleanName) return;

    let inputsSummary = '';
    let projectedRevenue = 0;
    let projectedProfit = 0;
    let marginPercent = 0;

    if (activeTab === 'Daily Profit') {
      inputsSummary = `${dineInCovers} covers @ ${formatMoney(avgTicket, currency)} · Food ${foodCostPct}% · Labor ${laborPct}%`;
      projectedRevenue = Math.round(netRealizedRevenue);
      projectedProfit = Math.round(dailyNetProfit);
      marginPercent = Number(dailyNetMargin.toFixed(1));
    } else if (activeTab === 'Break-Even') {
      inputsSummary = `Fixed ${formatMoney(totalMonthlyFixed, currency)}/mo · Var ${beVariableCostPct}% · ${requiredDailyCovers} covers/day`;
      projectedRevenue = Math.round(monthlyBreakEvenRev);
      projectedProfit = 0;
      marginPercent = Number((100 - beVariableCostPct).toFixed(1));
    } else if (activeTab === 'Menu Pricing') {
      inputsSummary = `Plate COGS ${formatMoney(totalDishCost, currency, 2)} · Target FC ${targetFoodCostPct}%`;
      projectedRevenue = Math.round(recommendedBasePrice);
      projectedProfit = Math.round(dishGrossProfit);
      marginPercent = Number((100 - targetFoodCostPct).toFixed(1));
    } else if (activeTab === 'Catering Quote') {
      inputsSummary = `${guestCount} pax Sadhya · Cost/plate ${formatMoney(foodPerPlateCost + leafAndConsumableCost, currency)}`;
      projectedRevenue = Math.round(eventQuoteTotal);
      projectedProfit = Math.round(eventNetProfit);
      marginPercent = Number(targetEventMarginPct.toFixed(1));
    } else {
      inputsSummary = `${riceKg}kg rice + ${uradKg}kg dal → ${wetBatterKg.toFixed(1)}kg batter (${totalPortions} dosas)`;
      projectedRevenue = Math.round(totalPortions);
      projectedProfit = Math.round(totalGrainCost);
      marginPercent = Number(costPerPortion.toFixed(2));
    }

    setSaving(true);
    try {
      const ref = doc(collection(db, 'calcScenarios'));
      await setDoc(ref, {
        ownerId,
        name: cleanName,
        calculatorType: activeTab,
        inputsSummary: clampStr(inputsSummary, 300),
        projectedRevenue: clampNum(projectedRevenue, 0, 1000000000),
        projectedProfit: clampNum(projectedProfit, -1000000000, 1000000000),
        marginPercent: clampNum(marginPercent, -1000, 100),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setScenarioName('');
      setSavedNotice(`Saved "${cleanName}"`);
      setTimeout(() => setSavedNotice(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'calcScenarios');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteScenario = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'calcScenarios', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `calcScenarios/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
          Sales, Profit &amp; Kitchen Calculators
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Model daily operating profit, break-even cover targets, menu prices, banana leaf catering quotes, and rice-urad batter yields.
        </p>
      </div>

      {/* Segmented Calculator Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 inline-flex flex-wrap gap-1">
        {CALC_TABS.map((tab, idx) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab
                ? 'bg-emerald-700 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            0{idx + 1}. {tab}
          </button>
        ))}
      </div>

      {/* Main Calculator Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Inputs */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          {activeTab === 'Daily Profit' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">
                Daily Sales &amp; Net Operating Profit Inputs
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumField label="Dine-in Covers / Day" value={dineInCovers} onChange={setDineInCovers} min={0} step={5} />
                <NumField label="Average Check Size" value={avgTicket} onChange={setAvgTicket} min={0} step={5} />
                <NumField label="Daily Catering / Tiffin Box Sales" value={cateringDaily} onChange={setCateringDaily} min={0} step={500} />
                <NumField label="Delivery Aggregator Gross Sales" value={aggregatorGross} onChange={setAggregatorGross} min={0} step={500} />
                <NumField label="Aggregator Commission %" value={aggregatorFeePct} onChange={setAggregatorFeePct} min={0} max={50} step={0.5} />
                <NumField label="Target Food Cost %" value={foodCostPct} onChange={setFoodCostPct} min={5} max={80} step={0.5} />
                <NumField label="Kitchen & Service Labor %" value={laborPct} onChange={setLaborPct} min={5} max={60} step={0.5} />
                <NumField label="Daily Wastage / Batter Loss %" value={wastagePct} onChange={setWastagePct} min={0} max={20} step={0.5} />
                <NumField label="Daily Fixed Overhead (Rent, Gas, Power)" value={dailyFixedOverhead} onChange={setDailyFixedOverhead} min={0} step={250} />
              </div>
            </>
          )}

          {activeTab === 'Break-Even' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">
                Monthly Break-Even &amp; Daily Cover Targets
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumField label="Monthly Facility Rent" value={monthlyRent} onChange={setMonthlyRent} min={0} step={1000} />
                <NumField label="Monthly Staff Payroll" value={monthlyPayroll} onChange={setMonthlyPayroll} min={0} step={1000} />
                <NumField label="Gas, Electricity &amp; Water / Mo" value={monthlyUtilities} onChange={setMonthlyUtilities} min={0} step={500} />
                <NumField label="Equipment EMI &amp; Misc Fixed / Mo" value={monthlyOtherFixed} onChange={setMonthlyOtherFixed} min={0} step={500} />
                <NumField label="Variable Cost % (Food + Pack + Fees)" value={beVariableCostPct} onChange={setBeVariableCostPct} min={5} max={85} step={1} />
                <NumField label="Average Order Value" value={beAvgCheck} onChange={setBeAvgCheck} min={10} step={5} />
              </div>
            </>
          )}

          {activeTab === 'Menu Pricing' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">
                Dish Price &amp; Food Cost Margin Modeler
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumField label="Recipe Ingredient Cost / Plate" value={dishPlateCost} onChange={setDishPlateCost} min={0} step={0.5} />
                <NumField label="Banana Leaf / Parcel Box Cost" value={dishPackCost} onChange={setDishPackCost} min={0} step={0.5} />
                <NumField label="Target Food Cost %" value={targetFoodCostPct} onChange={setTargetFoodCostPct} min={10} max={70} step={1} />
                <NumField label="GST / Tax Rate %" value={gstPct} onChange={setGstPct} min={0} max={28} step={0.5} />
              </div>

              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-xs font-semibold text-slate-700 mb-3">
                  Food Cost Sensitivity Table (COGS: {formatMoney(totalDishCost, currency, 2)})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="text-left py-2">Target Food Cost %</th>
                        <th className="text-right py-2">Menu Price (Ex-Tax)</th>
                        <th className="text-right py-2">With {gstPct}% GST</th>
                        <th className="text-right py-2">Profit / Plate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                      {[24, 28, 30, 32, 35].map((pct) => {
                        const p = totalDishCost / (pct / 100);
                        return (
                          <tr key={pct} className={pct === Math.round(targetFoodCostPct) ? 'bg-emerald-50/70 font-semibold' : ''}>
                            <td className="py-2 text-slate-700">{pct}%</td>
                            <td className="py-2 text-right text-slate-900">{formatMoney(p, currency, 2)}</td>
                            <td className="py-2 text-right text-slate-600">{formatMoney(p * (1 + gstPct / 100), currency, 2)}</td>
                            <td className="py-2 text-right text-emerald-700">{formatMoney(p - totalDishCost, currency, 2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'Catering Quote' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">
                Banana Leaf Sadhya &amp; Event Quote Calculator
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumField label="Confirmed Guest Count (Pax)" value={guestCount} onChange={setGuestCount} min={10} step={10} />
                <NumField label="Food Cost per Plate" value={foodPerPlateCost} onChange={setFoodPerPlateCost} min={0} step={2} />
                <NumField label="Banana Leaf, Water &amp; Cups / Pax" value={leafAndConsumableCost} onChange={setLeafAndConsumableCost} min={0} step={1} />
                <NumField label="Serving Staff &amp; Transport Cost" value={staffAndTransport} onChange={setStaffAndTransport} min={0} step={500} />
                <NumField label="Target Net Profit Margin %" value={targetEventMarginPct} onChange={setTargetEventMarginPct} min={5} max={70} step={1} />
              </div>
            </>
          )}

          {activeTab === 'Batter Yield' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">
                Wet Dosa / Idli Batter Yield &amp; Cost Calculator
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumField label="Idli / Parboiled Rice (kg)" value={riceKg} onChange={setRiceKg} min={1} step={1} />
                <NumField label="Rice Cost per kg" value={riceCostPerKg} onChange={setRiceCostPerKg} min={0} step={1} />
                <NumField label="Whole Urad Gota Dal (kg)" value={uradKg} onChange={setUradKg} min={0.5} step={0.5} />
                <NumField label="Urad Dal Cost per kg" value={uradCostPerKg} onChange={setUradCostPerKg} min={0} step={1} />
                <NumField label="Fenugreek, Poha &amp; Salt Batch Cost" value={fenugreekSaltCost} onChange={setFenugreekSaltCost} min={0} step={5} />
                <NumField label="Wet Grinding Expansion Ratio (x)" value={waterMultiplier} onChange={setWaterMultiplier} min={1.2} max={2.6} step={0.05} />
                <NumField label="Batter Portion per Dosa/Idli Plate (g)" value={portionGrams} onChange={setPortionGrams} min={50} step={5} />
              </div>
            </>
          )}
        </div>

        {/* Right: Live Results & Save Scenario */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="border-b border-slate-200 pb-3">
              <div className="text-xs font-medium text-emerald-700">{activeTab} Output</div>
              <div className="text-3xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {activeTab === 'Daily Profit' && formatMoney(dailyNetProfit, currency)}
                {activeTab === 'Break-Even' && `${requiredDailyCovers} covers / day`}
                {activeTab === 'Menu Pricing' && formatMoney(recommendedBasePrice, currency, 2)}
                {activeTab === 'Catering Quote' && formatMoney(eventQuoteTotal, currency)}
                {activeTab === 'Batter Yield' && `${totalPortions.toLocaleString('en-IN')} portions`}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {activeTab === 'Daily Profit' && 'Projected Net Daily Operating Profit'}
                {activeTab === 'Break-Even' && `Monthly break-even revenue: ${formatMoney(monthlyBreakEvenRev, currency)}`}
                {activeTab === 'Menu Pricing' && `Recommended pre-tax price (${formatMoney(priceWithGst, currency, 2)} incl. GST)`}
                {activeTab === 'Catering Quote' && `${formatMoney(eventPerPlateQuote, currency, 2)} per guest`}
                {activeTab === 'Batter Yield' && `${wetBatterKg.toFixed(1)} kg fermented batter yield`}
              </div>
            </div>

            {/* Detailed Line Items */}
            <div className="space-y-2.5 text-sm">
              {activeTab === 'Daily Profit' && (
                <>
                  <ResultRow label="Gross Sales (Dine-in + Catering + Delivery)" value={formatMoney(totalGrossSales, currency)} />
                  <ResultRow label="Aggregator Commissions" value={`-${formatMoney(aggregatorFees, currency)}`} muted />
                  <ResultRow label="Net Realized Revenue" value={formatMoney(netRealizedRevenue, currency)} bold />
                  <ResultRow label="Food Cost + Wastage" value={`-${formatMoney(totalFoodCost, currency)}`} muted />
                  <ResultRow label="Kitchen & Floor Labor" value={`-${formatMoney(totalLaborCost, currency)}`} muted />
                  <ResultRow label="Daily Fixed Overhead" value={`-${formatMoney(dailyFixedOverhead, currency)}`} muted />
                  <ResultRow label="Prime Cost % (Food + Labor)" value={formatPercent(primeCostPct)} />
                  <ResultRow label="Net Margin %" value={formatPercent(dailyNetMargin)} highlight={dailyNetProfit >= 0} />
                  <ResultRow label="30-Day Monthly Profit Run Rate" value={formatMoney(dailyNetProfit * 30, currency)} bold />
                </>
              )}

              {activeTab === 'Break-Even' && (
                <>
                  <ResultRow label="Total Monthly Fixed Costs" value={formatMoney(totalMonthlyFixed, currency)} bold />
                  <ResultRow label="Contribution Margin Ratio" value={formatPercent(contributionRatio * 100)} />
                  <ResultRow label="Monthly Break-Even Revenue" value={formatMoney(monthlyBreakEvenRev, currency)} bold />
                  <ResultRow label="Daily Break-Even Sales Target" value={formatMoney(dailyBreakEvenRev, currency)} />
                  <ResultRow label="Minimum Daily Covers Needed" value={`${requiredDailyCovers} covers`} highlight />
                </>
              )}

              {activeTab === 'Menu Pricing' && (
                <>
                  <ResultRow label="Total Plate + Packaging Cost" value={formatMoney(totalDishCost, currency, 2)} />
                  <ResultRow label="Gross Profit per Plate" value={formatMoney(dishGrossProfit, currency, 2)} highlight />
                  <ResultRow label="Recommended Base Menu Price" value={formatMoney(recommendedBasePrice, currency, 2)} bold />
                  <ResultRow label="Customer Price incl. GST" value={formatMoney(priceWithGst, currency, 2)} />
                </>
              )}

              {activeTab === 'Catering Quote' && (
                <>
                  <ResultRow label="Total Direct Cost (Food + Leaf + Staff)" value={formatMoney(eventDirectCost, currency)} />
                  <ResultRow label="Quote per Guest" value={formatMoney(eventPerPlateQuote, currency, 2)} bold />
                  <ResultRow label="Total Event Quote" value={formatMoney(eventQuoteTotal, currency)} bold />
                  <ResultRow label="Projected Net Event Profit" value={formatMoney(eventNetProfit, currency)} highlight />
                </>
              )}

              {activeTab === 'Batter Yield' && (
                <>
                  <ResultRow label="Total Dry Grain Weight" value={`${dryGrainKg.toFixed(1)} kg`} />
                  <ResultRow label="Total Wet Fermented Batter" value={`${wetBatterKg.toFixed(1)} kg`} bold />
                  <ResultRow label="Total Grain &amp; Seasoning Cost" value={formatMoney(totalGrainCost, currency, 2)} />
                  <ResultRow label="Batter Cost per kg" value={formatMoney(costPerKgBatter, currency, 2)} />
                  <ResultRow label="Batter Cost per Dosa / Idli Plate" value={formatMoney(costPerPortion, currency, 2)} highlight />
                </>
              )}
            </div>

            {/* Save Scenario Form */}
            <form onSubmit={handleSaveScenario} className="pt-4 border-t border-slate-200 space-y-2.5">
              <label className="block text-xs font-medium text-slate-700">
                Save Calculation Scenario
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder={`Name this ${activeTab.toLowerCase()} snapshot...`}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
              {savedNotice && (
                <p className="text-xs text-emerald-700 font-medium">{savedNotice}</p>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Saved Scenarios Comparison Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Saved Financial Scenarios</h2>
          <p className="text-xs text-slate-500">Compare saved daily targets, catering quotes, and break-even runs</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <th className="text-left font-medium px-6 py-3">Scenario Name</th>
                <th className="text-left font-medium px-4 py-3">Model</th>
                <th className="text-left font-medium px-4 py-3">Assumptions</th>
                <th className="text-right font-medium px-4 py-3">Primary Output</th>
                <th className="text-right font-medium px-4 py-3">Profit / Cost</th>
                <th className="text-right font-medium px-6 py-3">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {scenarios.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                    No saved scenarios yet. Save any calculation above to track benchmarks.
                  </td>
                </tr>
              ) : (
                scenarios.map((sc) => (
                  <tr key={sc.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-medium text-slate-900">{sc.name}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">{sc.calculatorType}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">{sc.inputsSummary}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900">
                      {sc.calculatorType === 'Batter Yield'
                        ? `${sc.projectedRevenue.toLocaleString('en-IN')} plates`
                        : formatMoney(sc.projectedRevenue, currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums font-medium text-emerald-700">
                      {sc.calculatorType === 'Batter Yield'
                        ? `${formatMoney(sc.marginPercent, currency, 2)}/plate`
                        : `${formatMoney(sc.projectedProfit, currency)} (${sc.marginPercent}%)`}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteScenario(sc.id)}
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded-md cursor-pointer"
                        title="Delete scenario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
      />
    </div>
  );
}

function ResultRow({
  label,
  value,
  bold,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={muted ? 'text-slate-500' : bold ? 'font-semibold text-slate-900' : 'text-slate-700'}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums ${
          highlight
            ? 'font-semibold text-emerald-700'
            : bold
            ? 'font-semibold text-slate-900'
            : muted
            ? 'text-slate-500'
            : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
