import { Fragment, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { APP_IMAGES } from '../data/southIndianSeeds';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  CurrencyCode,
  MenuCategory,
  MenuIngredient,
  MenuItem,
  MenuStatus,
} from '../types';
import { clampNum, clampStr, formatMoney, formatPercent } from '../utils/format';
import { ResilientImage } from './ResilientImage';

interface MenuModuleProps {
  ownerId: string;
  currency: CurrencyCode;
  menuItems: MenuItem[];
}

const MENU_CATEGORIES: MenuCategory[] = [
  'Tiffin & Dosas',
  'Meals & Rice',
  'Curries & Sides',
  'Filter Coffee & Drinks',
  'Sweets & Bakery',
];

const IMAGE_OPTIONS = [
  { key: '', label: 'Standard Text Row' },
  { key: 'masala_dosa', label: 'Ghee Roast Masala Dosa' },
  { key: 'idli_vada', label: 'Idli & Medu Vada' },
  { key: 'filter_coffee', label: 'Brass Filter Coffee' },
  { key: 'hero_spread', label: 'Banana Leaf Sadhya' },
];

export function MenuModule({ ownerId, currency, menuItems }: MenuModuleProps) {
  const [categoryFilter, setCategoryFilter] = useState<'All' | MenuCategory>('All');
  const [statusFilter, setStatusFilter] = useState<'all_active' | 'archived'>('all_active');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [regionalName, setRegionalName] = useState('');
  const [category, setCategory] = useState<MenuCategory>('Tiffin & Dosas');
  const [sellingPrice, setSellingPrice] = useState('140');
  const [packagingCost, setPackagingCost] = useState('6');
  const [prepMinutes, setPrepMinutes] = useState('8');
  const [monthlyUnits, setMonthlyUnits] = useState('500');
  const [imageKey, setImageKey] = useState('masala_dosa');
  const [status, setStatus] = useState<MenuStatus>('active');
  const [ingredients, setIngredients] = useState<MenuIngredient[]>([
    { name: 'Fermented Batter', qty: '180 g', unitCost: 9 },
  ]);

  const filteredItems = menuItems.filter((item) => {
    const matchesStatus =
      statusFilter === 'archived' ? item.status === 'archived' : item.status !== 'archived';
    const matchesCat = categoryFilter === 'All' || item.category === categoryFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.regionalName.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q);
    return matchesStatus && matchesCat && matchesSearch;
  });

  const activeOnly = menuItems.filter((m) => m.status !== 'archived');
  const avgFoodCost =
    activeOnly.length > 0
      ? activeOnly.reduce((sum, m) => {
          const totalCost = m.recipeCost + m.packagingCost;
          return sum + (m.sellingPrice > 0 ? (totalCost / m.sellingPrice) * 100 : 0);
        }, 0) / activeOnly.length
      : 0;
  const totalEstRevenue = activeOnly.reduce((s, m) => s + m.sellingPrice * m.monthlyUnits, 0);
  const totalEstGrossProfit = activeOnly.reduce(
    (s, m) => s + (m.sellingPrice - m.recipeCost - m.packagingCost) * m.monthlyUnits,
    0
  );

  const openCreateModal = () => {
    setEditingItem(null);
    setName('');
    setRegionalName('');
    setCategory('Tiffin & Dosas');
    setSellingPrice('120');
    setPackagingCost('6');
    setPrepMinutes('7');
    setMonthlyUnits('450');
    setImageKey('masala_dosa');
    setStatus('active');
    setIngredients([
      { name: 'Fermented Batter', qty: '180 g', unitCost: 9 },
      { name: 'Sambar & Chutneys', qty: '150 ml', unitCost: 6 },
    ]);
    setModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setRegionalName(item.regionalName);
    setCategory(item.category);
    setSellingPrice(String(item.sellingPrice));
    setPackagingCost(String(item.packagingCost));
    setPrepMinutes(String(item.prepMinutes));
    setMonthlyUnits(String(item.monthlyUnits));
    setImageKey(item.imageKey || '');
    setStatus(item.status);
    setIngredients(
      item.ingredients.length > 0
        ? item.ingredients.map((i) => ({ ...i }))
        : [{ name: 'Base Ingredients', qty: '1 portion', unitCost: item.recipeCost }]
    );
    setModalOpen(true);
  };

  const computedRecipeCost = ingredients.reduce((sum, ing) => sum + (Number(ing.unitCost) || 0), 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(name, 120);
    if (!cleanName) return;

    const cleanIngredients: MenuIngredient[] = ingredients
      .filter((ing) => ing.name.trim().length > 0)
      .slice(0, 20)
      .map((ing) => ({
        name: clampStr(ing.name, 80),
        qty: clampStr(ing.qty || '1 unit', 40),
        unitCost: clampNum(Number(ing.unitCost) || 0, 0, 100000),
      }));

    const finalRecipeCost = cleanIngredients.reduce((s, ing) => s + ing.unitCost, 0);

    const payload = {
      ownerId,
      name: cleanName,
      regionalName: clampStr(regionalName, 120),
      category,
      sellingPrice: clampNum(Number(sellingPrice) || 0, 0, 1000000),
      recipeCost: clampNum(finalRecipeCost, 0, 1000000),
      packagingCost: clampNum(Number(packagingCost) || 0, 0, 100000),
      prepMinutes: clampNum(Number(prepMinutes) || 0, 0, 1440),
      monthlyUnits: clampNum(Number(monthlyUnits) || 0, 0, 1000000),
      imageKey: clampStr(imageKey, 64),
      ingredients: cleanIngredients,
      status,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'menuItems', editingItem.id), payload);
      } else {
        const newRef = doc(collection(db, 'menuItems'));
        await setDoc(newRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingItem ? OperationType.UPDATE : OperationType.CREATE,
        'menuItems'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (item: MenuItem) => {
    try {
      await updateDoc(doc(db, 'menuItems', item.id), {
        status: 'archived',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menuItems/${item.id}`);
    }
  };

  const handleDelete = async (item: MenuItem) => {
    try {
      await deleteDoc(doc(db, 'menuItems', item.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `menuItems/${item.id}`);
    }
  };

  const getEngineeringQuadrant = (foodCostPct: number, monthlyUnitsVal: number): string => {
    const highMargin = foodCostPct <= 30;
    const highVolume = monthlyUnitsVal >= 600;
    if (highMargin && highVolume) return 'Star';
    if (!highMargin && highVolume) return 'Plowhorse';
    if (highMargin && !highVolume) return 'Puzzle';
    return 'Review Cost';
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
            South Indian Menu &amp; Recipe Costing
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Engineer dish margins across dosas, idlis, Sadhya thalis, curries, and filter coffee with ingredient-level COGS.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Menu Dish
        </button>
      </div>

      {/* Menu Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Active Dishes · Avg Food Cost</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {activeOnly.length} dishes · {formatPercent(avgFoodCost)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Est. Monthly Menu Revenue</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatMoney(totalEstRevenue, currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Est. Monthly Gross Contribution</div>
          <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {formatMoney(totalEstGrossProfit, currency)}
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['All', ...MENU_CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dosa, idli, coffee..."
              className="pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setStatusFilter('all_active')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === 'all_active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('archived')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === 'archived' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Archived
            </button>
          </div>
        </div>
      </div>

      {/* Menu Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <th className="text-left font-medium px-6 py-3">Dish &amp; Regional Name</th>
                <th className="text-right font-medium px-4 py-3">Selling Price</th>
                <th className="text-right font-medium px-4 py-3">Plate Cost</th>
                <th className="text-right font-medium px-4 py-3">Food Cost %</th>
                <th className="text-right font-medium px-4 py-3">Margin / Plate</th>
                <th className="text-left font-medium px-4 py-3">Matrix</th>
                <th className="text-right font-medium px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                    No dishes match your filter. Click &ldquo;Add Menu Dish&rdquo; to create a recipe cost card.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const plateCost = item.recipeCost + item.packagingCost;
                  const margin = item.sellingPrice - plateCost;
                  const fcPct = item.sellingPrice > 0 ? (plateCost / item.sellingPrice) * 100 : 0;
                  const quadrant = getEngineeringQuadrant(fcPct, item.monthlyUnits);
                  const isExpanded = expandedId === item.id;
                  const imgObj = item.imageKey ? APP_IMAGES[item.imageKey] : undefined;

                  return (
                    <Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5">
                            {imgObj && (
                              <div className="w-12 h-10 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                <ResilientImage
                                  src={imgObj.src}
                                  alt={item.name}
                                  fallbackLabel={item.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-slate-900">{item.name}</div>
                              <div className="text-xs text-slate-500">
                                {item.category}
                                {item.regionalName ? ` · ${item.regionalName}` : ''}
                                {item.status === 'seasonal' ? ' · Seasonal' : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatMoney(item.sellingPrice, currency, 2)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono tabular-nums text-slate-600">
                          {formatMoney(plateCost, currency, 2)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono tabular-nums">
                          <span
                            className={`font-medium ${
                              fcPct <= 30
                                ? 'text-emerald-700'
                                : fcPct <= 36
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {formatPercent(fcPct)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatMoney(margin, currency, 2)}
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-slate-700">
                          {quadrant} · {item.monthlyUnits}/mo
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
                              title="Inspect recipe breakdown"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {item.status !== 'archived' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-md hover:bg-slate-100 cursor-pointer"
                                  title="Edit recipe"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleArchive(item)}
                                  className="p-1.5 text-slate-500 hover:text-amber-700 rounded-md hover:bg-slate-100 cursor-pointer"
                                  title="Archive dish"
                                >
                                  <Archive className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="p-1.5 text-slate-500 hover:text-red-700 rounded-md hover:bg-slate-100 cursor-pointer"
                              title="Delete dish"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                              <div className="flex-1">
                                <h4 className="text-xs font-semibold text-slate-700 mb-2">
                                  Recipe Ingredient Cost Breakdown ({item.prepMinutes} min prep)
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  {item.ingredients.map((ing, idx) => (
                                    <div
                                      key={`${ing.name}-${idx}`}
                                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-xs font-medium text-slate-900 truncate">
                                          {ing.name}
                                        </div>
                                        <div className="text-xs text-slate-500">{ing.qty}</div>
                                      </div>
                                      <div className="text-xs font-mono tabular-nums font-medium text-slate-900 shrink-0">
                                        {formatMoney(ing.unitCost, currency, 2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="text-xs text-slate-600 space-y-1 shrink-0 min-w-[200px] border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-5">
                                <div className="flex justify-between gap-4">
                                  <span>Ingredients Subtotal</span>
                                  <span className="font-mono tabular-nums font-medium text-slate-900">
                                    {formatMoney(item.recipeCost, currency, 2)}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span>Leaf / Parcel Packaging</span>
                                  <span className="font-mono tabular-nums font-medium text-slate-900">
                                    {formatMoney(item.packagingCost, currency, 2)}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4 pt-1 border-t border-slate-200 font-semibold text-slate-900">
                                  <span>Est. Monthly Profit</span>
                                  <span className="font-mono tabular-nums text-emerald-700">
                                    {formatMoney(margin * item.monthlyUnits, currency)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Dish Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingItem ? 'Edit Dish & Recipe Costing' : 'New South Indian Dish'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Dish Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Ghee Podi Masala Dosa"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Regional / Traditional Name
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={regionalName}
                    onChange={(e) => setRegionalName(e.target.value)}
                    placeholder="e.g., Nei Podi Dosai"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MenuCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-700"
                  >
                    {MENU_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as MenuStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-700"
                  >
                    <option value="active">Active</option>
                    <option value="seasonal">Seasonal</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dish Photo</label>
                  <select
                    value={imageKey}
                    onChange={(e) => setImageKey(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-700"
                  >
                    {IMAGE_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Selling Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Leaf / Packaging
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={packagingCost}
                    onChange={(e) => setPackagingCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prep Time (min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={prepMinutes}
                    onChange={(e) => setPrepMinutes(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Est. Units / Mo
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={monthlyUnits}
                    onChange={(e) => setMonthlyUnits(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              {/* Dynamic Ingredients List */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Recipe Ingredients</h3>
                    <p className="text-xs text-slate-500">
                      Recipe COGS: <span className="font-mono font-medium text-slate-900">{formatMoney(computedRecipeCost, currency, 2)}</span>
                      {' · '}
                      Est. Food Cost:{' '}
                      <span className="font-mono font-medium text-emerald-700">
                        {formatPercent(
                          Number(sellingPrice) > 0
                            ? ((computedRecipeCost + (Number(packagingCost) || 0)) / Number(sellingPrice)) * 100
                            : 0
                        )}
                      </span>
                    </p>
                  </div>
                  {ingredients.length < 20 && (
                    <button
                      type="button"
                      onClick={() =>
                        setIngredients([...ingredients, { name: '', qty: '50 g', unitCost: 5 }])
                      }
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      + Add Ingredient
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {ingredients.map((ing, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        maxLength={80}
                        placeholder="Ingredient (e.g., A2 Cow Ghee)"
                        value={ing.name}
                        onChange={(e) => {
                          const next = [...ingredients];
                          next[index] = { ...next[index], name: e.target.value };
                          setIngredients(next);
                        }}
                        className="col-span-6 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        maxLength={40}
                        placeholder="Qty (e.g., 15 ml)"
                        value={ing.qty}
                        onChange={(e) => {
                          const next = [...ingredients];
                          next[index] = { ...next[index], qty: e.target.value };
                          setIngredients(next);
                        }}
                        className="col-span-3 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Cost"
                        value={ing.unitCost}
                        onChange={(e) => {
                          const next = [...ingredients];
                          next[index] = { ...next[index], unitCost: Number(e.target.value) };
                          setIngredients(next);
                        }}
                        className="col-span-2 px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
                        className="col-span-1 p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Remove ingredient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Dish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
