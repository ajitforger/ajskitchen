import { useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { APP_IMAGES } from '../data/southIndianSeeds';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  CurrencyCode,
  MenuCategory,
  MenuItem,
  PaymentMethod,
  PosOrder,
  PosOrderItem,
  PosOrderStatus,
  PosOrderType,
} from '../types';
import { clampNum, clampStr, formatMoney, todayISO } from '../utils/format';
import { ResilientImage } from './ResilientImage';

interface PosModuleProps {
  ownerId: string;
  restaurantName: string;
  currency: CurrencyCode;
  menuItems: MenuItem[];
  posOrders: PosOrder[];
}

const POS_CATEGORIES: Array<'All' | MenuCategory> = [
  'All',
  'Tiffin & Dosas',
  'Meals & Rice',
  'Curries & Sides',
  'Filter Coffee & Drinks',
  'Sweets & Bakery',
];

const TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];

const QUICK_NOTES = ['Less Ghee', 'Extra Crispy', 'No Onion', 'Separate Sambar', 'Strong Coffee'];

const POS_PAYMENT_METHODS: PaymentMethod[] = [
  'UPI / QR',
  'Cash',
  'Card Settlement',
  'Aggregator Payout',
];

export function PosModule({
  ownerId,
  restaurantName,
  currency,
  menuItems,
  posOrders,
}: PosModuleProps) {
  const [subView, setSubView] = useState<'register' | 'kot' | 'history'>('register');
  const [catFilter, setCatFilter] = useState<'All' | MenuCategory>('All');
  const [search, setSearch] = useState('');

  // Active Ticket State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<PosOrderType>('dine_in');
  const [tableLabel, setTableLabel] = useState('T1');
  const [customerName, setCustomerName] = useState('');
  const [cart, setCart] = useState<PosOrderItem[]>([]);
  const [includePackaging, setIncludePackaging] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [taxRate, setTaxRate] = useState(5);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI / QR');
  const [cashTendered, setCashTendered] = useState('');
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Receipt Modal
  const [receiptOrder, setReceiptOrder] = useState<PosOrder | null>(null);

  const activeMenu = useMemo(
    () => menuItems.filter((m) => m.status !== 'archived'),
    [menuItems]
  );

  const filteredDishes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeMenu.filter((item) => {
      const matchesCat = catFilter === 'All' || item.category === catFilter;
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.regionalName.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [activeMenu, catFilter, search]);

  const activeKots = useMemo(
    () =>
      posOrders
        .filter((o) => o.status === 'kot_open' || o.status === 'preparing' || o.status === 'ready')
        .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber)),
    [posOrders]
  );

  const settledOrders = useMemo(
    () =>
      posOrders
        .filter((o) => o.status === 'paid' || o.status === 'cancelled')
        .sort((a, b) => b.orderNumber.localeCompare(a.orderNumber)),
    [posOrders]
  );

  // Map occupied tables to their open KOT
  const openOrderByTable = useMemo(() => {
    const map: Record<string, PosOrder> = {};
    for (const o of activeKots) {
      if (o.orderType === 'dine_in' && o.tableLabel) {
        map[o.tableLabel] = o;
      }
    }
    return map;
  }, [activeKots]);

  // Totals math
  const subtotal = cart.reduce((s, item) => s + item.unitPrice * item.qty, 0);
  const packagingTotal =
    orderType === 'parcel' || includePackaging
      ? cart.reduce((s, item) => s + item.packagingCost * item.qty, 0)
      : 0;
  const discountAmount = Math.round(((subtotal * clampNum(discountPct, 0, 100)) / 100) * 100) / 100;
  const taxableBase = Math.max(0, subtotal + packagingTotal - discountAmount);
  const taxAmount = Math.round(((taxableBase * clampNum(taxRate, 0, 28)) / 100) * 100) / 100;
  const grandTotal = Math.round((taxableBase + taxAmount) * 100) / 100;

  const cashTenderedNum = Number(cashTendered) || 0;
  const changeDue = cashTenderedNum > grandTotal ? cashTenderedNum - grandTotal : 0;

  // Today POS Metrics
  const paidOrders = posOrders.filter((o) => o.status === 'paid');
  const totalPosRevenue = paidOrders.reduce((s, o) => s + o.grandTotal, 0);
  const avgTicketValue = paidOrders.length > 0 ? totalPosRevenue / paidOrders.length : 0;

  const generateNextOrderNumber = () => {
    const nextNum = 1001 + posOrders.length;
    return `DL-${nextNum}`;
  };

  const resetRegister = () => {
    setEditingOrderId(null);
    setEditingOrderNumber(null);
    setCart([]);
    setCustomerName('');
    setDiscountPct(0);
    setKitchenNotes('');
    setCashTendered('');
  };

  const loadOrderIntoRegister = (order: PosOrder) => {
    setEditingOrderId(order.id);
    setEditingOrderNumber(order.orderNumber);
    setOrderType(order.orderType);
    setTableLabel(order.tableLabel || 'T1');
    setCustomerName(order.customerName || '');
    setCart(order.items.map((i) => ({ ...i })));
    setIncludePackaging(order.packagingTotal > 0);
    setDiscountPct(
      order.subtotal > 0 ? Math.round((order.discountAmount / order.subtotal) * 100) : 0
    );
    setTaxRate(order.taxRate);
    setPaymentMethod(order.paymentMethod);
    setKitchenNotes(order.kitchenNotes || '');
    setSubView('register');
  };

  const addDishToCart = (dish: MenuItem) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.menuItemId === dish.id && !i.note);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], qty: next[existingIdx].qty + 1 };
        return next;
      }
      if (prev.length >= 40) return prev;
      return [
        ...prev,
        {
          menuItemId: dish.id,
          name: clampStr(dish.name, 120),
          qty: 1,
          unitPrice: clampNum(dish.sellingPrice, 0, 1000000),
          packagingCost: clampNum(dish.packagingCost, 0, 100000),
          note: '',
        },
      ];
    });
  };

  const updateItemQty = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const newQty = next[index].qty + delta;
      if (newQty <= 0) {
        next.splice(index, 1);
      } else {
        next[index] = { ...next[index], qty: clampNum(newQty, 1, 500) };
      }
      return next;
    });
  };

  const updateItemNote = (index: number, noteText: string) => {
    setCart((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], note: clampStr(noteText, 120) };
      return next;
    });
  };

  const handleSelectOrderType = (nextType: PosOrderType) => {
    setOrderType(nextType);
    if (nextType === 'parcel') {
      setIncludePackaging(true);
      setTableLabel('Parcel');
    } else if (nextType === 'catering_counter') {
      setIncludePackaging(true);
      setTableLabel('Counter');
    } else {
      setIncludePackaging(false);
      if (tableLabel === 'Parcel' || tableLabel === 'Counter') {
        setTableLabel('T1');
      }
    }
  };

  const handleSelectTable = (tbl: string) => {
    const occupied = openOrderByTable[tbl];
    if (occupied) {
      loadOrderIntoRegister(occupied);
    } else {
      if (editingOrderId) {
        resetRegister();
      }
      setOrderType('dine_in');
      setTableLabel(tbl);
    }
  };

  const buildSanitizedOrderPayload = (targetStatus: PosOrderStatus) => {
    const cleanItems: PosOrderItem[] = cart.slice(0, 40).map((item) => ({
      menuItemId: item.menuItemId,
      name: clampStr(item.name, 120) || 'Menu Item',
      qty: clampNum(item.qty, 1, 500),
      unitPrice: clampNum(item.unitPrice, 0, 1000000),
      packagingCost: clampNum(item.packagingCost, 0, 100000),
      note: clampStr(item.note, 120),
    }));

    const orderNum = editingOrderNumber || generateNextOrderNumber();
    const resolvedLabel =
      orderType === 'dine_in'
        ? clampStr(tableLabel || 'T1', 32)
        : orderType === 'parcel'
        ? clampStr(`Parcel ${orderNum}`, 32)
        : clampStr(`Counter ${orderNum}`, 32);

    return {
      ownerId,
      orderNumber: clampStr(orderNum, 32),
      orderType,
      tableLabel: resolvedLabel,
      customerName: clampStr(customerName, 100),
      items: cleanItems,
      subtotal: clampNum(subtotal, 0, 100000000),
      packagingTotal: clampNum(packagingTotal, 0, 10000000),
      discountAmount: clampNum(discountAmount, 0, 100000000),
      taxRate: clampNum(taxRate, 0, 28),
      taxAmount: clampNum(taxAmount, 0, 100000000),
      grandTotal: clampNum(grandTotal, 0, 100000000),
      paymentMethod,
      kitchenNotes: clampStr(kitchenNotes, 300),
      status: targetStatus,
      updatedAt: serverTimestamp(),
    };
  };

  const handleSendKot = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const payload = buildSanitizedOrderPayload('kot_open');
      if (editingOrderId) {
        const { ownerId: _o, orderNumber: _n, ...updateFields } = payload;
        await updateDoc(doc(db, 'posOrders', editingOrderId), updateFields);
      } else {
        const newRef = doc(collection(db, 'posOrders'));
        await setDoc(newRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      resetRegister();
      setSubView('kot');
    } catch (error) {
      handleFirestoreError(
        error,
        editingOrderId ? OperationType.UPDATE : OperationType.CREATE,
        'posOrders'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettleBill = async () => {
    if (cart.length === 0 || grandTotal <= 0) return;
    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const payload = buildSanitizedOrderPayload('paid');
      const orderRef = editingOrderId
        ? doc(db, 'posOrders', editingOrderId)
        : doc(collection(db, 'posOrders'));

      if (editingOrderId) {
        const { ownerId: _o, orderNumber: _n, ...updateFields } = payload;
        batch.update(orderRef, updateFields);
      } else {
        batch.set(orderRef, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      // Sync settled POS sale into Money Management Ledger automatically
      const ledgerRef = doc(collection(db, 'ledgerEntries'));
      const categoryLabel =
        orderType === 'dine_in'
          ? 'Dine-in Settlement'
          : orderType === 'parcel'
          ? 'Counter Coffee & Parcel'
          : 'Catering & Events';

      batch.set(ledgerRef, {
        ownerId,
        title: clampStr(`POS Bill ${payload.orderNumber} (${payload.tableLabel})`, 160),
        entryType: 'income',
        category: categoryLabel,
        amount: clampNum(grandTotal, 0.01, 100000000),
        paymentMethod,
        entryDate: todayISO(),
        vendorId: '',
        notes: clampStr(
          `${cart.reduce((s, i) => s + i.qty, 0)} items · Tax ${formatMoney(taxAmount, currency, 2)}`,
          400
        ),
        status: 'cleared',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setReceiptOrder({
        id: orderRef.id,
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      resetRegister();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'posOrders');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceKot = async (order: PosOrder, nextStatus: PosOrderStatus) => {
    try {
      await updateDoc(doc(db, 'posOrders', order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posOrders/${order.id}`);
    }
  };

  const handleDeleteOrder = async (order: PosOrder) => {
    try {
      await deleteDoc(doc(db, 'posOrders', order.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posOrders/${order.id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Sub-View Segmented Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
            POS Register &amp; Kitchen Order Tickets
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Take dine-in table orders, parcel bills, and counter coffee tickets — settled bills sync directly to Money Ledger.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setSubView('register')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subView === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            POS Register
          </button>
          <button
            type="button"
            onClick={() => setSubView('kot')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subView === 'kot' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active KOTs ({activeKots.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('history')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              subView === 'history' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bill History ({settledOrders.length})
          </button>
        </div>
      </div>

      {/* POS Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">POS Settled Revenue</div>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {formatMoney(totalPosRevenue, currency)}
            </div>
          </div>
          <Receipt className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Open Kitchen KOTs</div>
            <div className="text-xl font-bold text-amber-700 font-mono tabular-nums mt-0.5">
              {activeKots.length} tickets
            </div>
          </div>
          <Clock className="w-5 h-5 text-amber-600" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Average POS Ticket</div>
            <div className="text-xl font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {formatMoney(avgTicketValue, currency)}
            </div>
          </div>
          <UtensilsCrossed className="w-5 h-5 text-slate-500" />
        </div>
      </div>

      {/* VIEW 1: REGISTER */}
      {subView === 'register' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left 7 cols: Tables + Dish Picker */}
          <div className="xl:col-span-7 space-y-4">
            {/* Order Type + Table Grid */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'dine_in', label: 'Dine-In Table' },
                      { id: 'parcel', label: 'Parcel / Takeaway' },
                      { id: 'catering_counter', label: 'Counter Token' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleSelectOrderType(mode.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        orderType === mode.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {editingOrderNumber && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-amber-700">
                      Editing {editingOrderNumber}
                    </span>
                    <button
                      type="button"
                      onClick={resetRegister}
                      className="text-slate-500 hover:text-slate-900 underline cursor-pointer"
                    >
                      New Ticket
                    </button>
                  </div>
                )}
              </div>

              {orderType === 'dine_in' && (
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-1">
                  {TABLES.map((tbl) => {
                    const isOccupied = Boolean(openOrderByTable[tbl]);
                    const isSelected = tableLabel === tbl;
                    return (
                      <button
                        key={tbl}
                        type="button"
                        onClick={() => handleSelectTable(tbl)}
                        className={`py-2 px-1 text-xs font-mono font-semibold rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : isOccupied
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                        title={isOccupied ? `${tbl} has open KOT` : `${tbl} available`}
                      >
                        {tbl}
                        {isOccupied && !isSelected ? ' ·' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Category Tabs + Search */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Quick search dosa, idli, filter coffee, meals..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
                {POS_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      catFilter === cat ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Dish Grid */}
            {filteredDishes.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                No active menu dishes match your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDishes.map((dish) => {
                  const imgObj = dish.imageKey ? APP_IMAGES[dish.imageKey] : undefined;
                  const inCartCount = cart
                    .filter((c) => c.menuItemId === dish.id)
                    .reduce((s, c) => s + c.qty, 0);

                  return (
                    <button
                      key={dish.id}
                      type="button"
                      onClick={() => addDishToCart(dish)}
                      className="text-left bg-white hover:bg-emerald-50/40 border border-slate-200 hover:border-emerald-600 rounded-xl p-3.5 transition-colors flex flex-col justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        {imgObj && (
                          <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                            <ResilientImage
                              src={imgObj.src}
                              alt={dish.name}
                              fallbackLabel={dish.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 leading-snug">
                            {dish.name}
                          </div>
                          <div className="text-xs text-slate-500 truncate mt-0.5">
                            {dish.regionalName || dish.category}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                          {formatMoney(dish.sellingPrice, currency)}
                        </span>
                        <span className="text-xs font-medium text-emerald-700">
                          {inCartCount > 0 ? `${inCartCount} in bill · +1` : '+ Add'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right 5 cols: Active Ticket & Settlement */}
          <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-6">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {editingOrderNumber ? `Ticket ${editingOrderNumber}` : 'New Order Ticket'}
                </h2>
                <p className="text-xs text-slate-500">
                  {orderType === 'dine_in'
                    ? `Dine-In · Table ${tableLabel}`
                    : orderType === 'parcel'
                    ? 'Parcel / Takeaway'
                    : 'Counter Token'}
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={resetRegister}
                  className="text-xs font-medium text-red-700 hover:text-red-800 cursor-pointer"
                >
                  Clear Bill
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {/* Customer Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Guest / Token Name
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Table / Label
                  </label>
                  <input
                    type="text"
                    maxLength={32}
                    value={tableLabel}
                    onChange={(e) => setTableLabel(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Cart Items */}
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 max-h-72 overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">
                    Select dishes from the menu grid to build an order ticket.
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div key={`${item.menuItemId}-${idx}`} className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-500">
                            {formatMoney(item.unitPrice, currency)} each
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateItemQty(idx, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-mono tabular-nums font-semibold">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItemQty(idx, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="w-20 text-right text-sm font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                          {formatMoney(item.unitPrice * item.qty, currency)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={120}
                          value={item.note}
                          onChange={(e) => updateItemNote(idx, e.target.value)}
                          placeholder="Kitchen note (e.g., Less Ghee)"
                          className="flex-1 px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
                        />
                        <div className="hidden sm:flex items-center gap-1">
                          {QUICK_NOTES.slice(0, 2).map((qn) => (
                            <button
                              key={qn}
                              type="button"
                              onClick={() => updateItemNote(idx, qn)}
                              className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer whitespace-nowrap"
                            >
                              {qn}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Modifiers: Packaging, Discount, GST */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Discount %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discountPct}
                    onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">GST Rate</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-200 rounded-lg bg-white"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5% (Standard)</option>
                    <option value={12}>12% (Catering)</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-1.5 py-1.5 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={orderType === 'parcel' || includePackaging}
                      onChange={(e) => setIncludePackaging(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-700"
                    />
                    <span>Parcel Pack</span>
                  </label>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Items Subtotal</span>
                  <span className="font-mono tabular-nums">{formatMoney(subtotal, currency, 2)}</span>
                </div>
                {packagingTotal > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Banana Leaf / Parcel Boxes</span>
                    <span className="font-mono tabular-nums">{formatMoney(packagingTotal, currency, 2)}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount ({discountPct}%)</span>
                    <span className="font-mono tabular-nums">-{formatMoney(discountAmount, currency, 2)}</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>
                      GST ({taxRate}% · CGST {taxRate / 2}% + SGST {taxRate / 2}%)
                    </span>
                    <span className="font-mono tabular-nums">{formatMoney(taxAmount, currency, 2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200 text-base font-bold text-slate-900">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">{formatMoney(grandTotal, currency, 2)}</span>
                </div>
              </div>

              {/* Kitchen Note + Payment Method */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  maxLength={300}
                  value={kitchenNotes}
                  onChange={(e) => setKitchenNotes(e.target.value)}
                  placeholder="Order-wide kitchen note (e.g., Serve filter coffee after dosa)"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {POS_PAYMENT_METHODS.map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap truncate ${
                        paymentMethod === pm
                          ? 'bg-emerald-50 border-emerald-700 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>

                {paymentMethod === 'Cash' && grandTotal > 0 && (
                  <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">Cash Tendered:</span>
                      <input
                        type="number"
                        min={0}
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        placeholder={String(Math.ceil(grandTotal))}
                        className="w-24 px-2 py-1 font-mono tabular-nums bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div className="font-mono tabular-nums font-semibold text-slate-900">
                      Change: {formatMoney(changeDue, currency, 2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={cart.length === 0 || submitting}
                  onClick={handleSendKot}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-900 border border-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ChefHat className="w-4 h-4 text-amber-700" />
                  {editingOrderId ? 'Update KOT' : 'Send KOT'}
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0 || grandTotal <= 0 || submitting}
                  onClick={handleSettleBill}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  {submitting ? 'Settling...' : 'Settle & Print'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: ACTIVE KOT QUEUE */}
      {subView === 'kot' && (
        <div className="space-y-4">
          {activeKots.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <p className="text-sm text-slate-500">
                No active Kitchen Order Tickets right now. Create a dine-in or parcel order in POS Register and click &ldquo;Send KOT&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => setSubView('register')}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg cursor-pointer"
              >
                Open POS Register
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeKots.map((kot) => (
                <div
                  key={kot.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                      <div>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {kot.orderNumber}
                        </span>
                        <span className="mx-2 text-slate-300">·</span>
                        <span className="text-sm font-semibold text-slate-800">{kot.tableLabel}</span>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          kot.status === 'ready'
                            ? 'text-emerald-700'
                            : kot.status === 'preparing'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {kot.status === 'ready'
                          ? 'Ready to Serve'
                          : kot.status === 'preparing'
                          ? 'Preparing'
                          : 'KOT Open'}
                      </span>
                    </div>

                    <div className="p-5 space-y-2.5">
                      {kot.items.map((item, idx) => (
                        <div key={`${item.menuItemId}-${idx}`} className="flex justify-between gap-3 text-sm">
                          <div>
                            <span className="font-mono font-bold text-slate-900 mr-2">
                              {item.qty}x
                            </span>
                            <span className="text-slate-800 font-medium">{item.name}</span>
                            {item.note && (
                              <div className="text-xs text-amber-700 pl-6">{item.note}</div>
                            )}
                          </div>
                          <span className="font-mono tabular-nums text-slate-600 shrink-0">
                            {formatMoney(item.unitPrice * item.qty, currency)}
                          </span>
                        </div>
                      ))}

                      {kot.kitchenNotes && (
                        <div className="pt-2 border-t border-slate-100 text-xs text-slate-600">
                          Note: {kot.kitchenNotes}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between gap-2">
                    <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                      {formatMoney(kot.grandTotal, currency)}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {kot.status === 'kot_open' && (
                        <button
                          type="button"
                          onClick={() => handleAdvanceKot(kot, 'preparing')}
                          className="px-2.5 py-1.5 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md cursor-pointer"
                        >
                          Start Prep
                        </button>
                      )}
                      {kot.status === 'preparing' && (
                        <button
                          type="button"
                          onClick={() => handleAdvanceKot(kot, 'ready')}
                          className="px-2.5 py-1.5 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md cursor-pointer"
                        >
                          Mark Ready
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => loadOrderIntoRegister(kot)}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-md cursor-pointer"
                      >
                        Settle Bill
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdvanceKot(kot, 'cancelled')}
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded-md cursor-pointer"
                        title="Cancel ticket"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: ORDER HISTORY */}
      {subView === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                  <th className="text-left font-medium px-6 py-3">Order #</th>
                  <th className="text-left font-medium px-4 py-3">Service &amp; Guest</th>
                  <th className="text-left font-medium px-4 py-3">Items</th>
                  <th className="text-left font-medium px-4 py-3">Payment</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-right font-medium px-4 py-3">Total</th>
                  <th className="text-right font-medium px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {settledOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">
                      No settled POS bills yet.
                    </td>
                  </tr>
                ) : (
                  settledOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3.5 font-mono font-semibold text-slate-900">
                        {order.orderNumber}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{order.tableLabel}</div>
                        <div className="text-xs text-slate-500">
                          {order.orderType === 'dine_in'
                            ? 'Dine-In'
                            : order.orderType === 'parcel'
                            ? 'Parcel'
                            : 'Counter'}
                          {order.customerName ? ` · ${order.customerName}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 max-w-xs truncate">
                        {order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">{order.paymentMethod}</td>
                      <td className="px-4 py-3.5 text-xs font-medium">
                        <span className={order.status === 'paid' ? 'text-emerald-700' : 'text-red-700'}>
                          {order.status === 'paid' ? 'Paid' : 'Cancelled'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatMoney(order.grandTotal, currency, 2)}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setReceiptOrder(order)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Receipt
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order)}
                            className="p-1.5 text-slate-400 hover:text-red-700 rounded-md cursor-pointer"
                            title="Delete record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thermal Receipt Preview Modal */}
      {receiptOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                Bill Receipt · {receiptOrder.orderNumber}
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 font-mono text-xs text-slate-800 space-y-4">
              <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
                <div className="text-sm font-bold text-slate-900">{restaurantName}</div>
                <div className="text-[11px] text-slate-500">
                  Order {receiptOrder.orderNumber} · {receiptOrder.tableLabel}
                </div>
                {receiptOrder.customerName && (
                  <div className="text-[11px] text-slate-500">Guest: {receiptOrder.customerName}</div>
                )}
              </div>

              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3">
                {receiptOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between gap-2">
                    <span className="truncate">
                      {item.qty}x {item.name}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {formatMoney(item.unitPrice * item.qty, currency, 2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(receiptOrder.subtotal, currency, 2)}</span>
                </div>
                {receiptOrder.packagingTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Packaging</span>
                    <span className="tabular-nums">
                      {formatMoney(receiptOrder.packagingTotal, currency, 2)}
                    </span>
                  </div>
                )}
                {receiptOrder.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span className="tabular-nums">
                      -{formatMoney(receiptOrder.discountAmount, currency, 2)}
                    </span>
                  </div>
                )}
                {receiptOrder.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>GST ({receiptOrder.taxRate}%)</span>
                    <span className="tabular-nums">{formatMoney(receiptOrder.taxAmount, currency, 2)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-dashed border-slate-300 text-sm font-bold text-slate-900">
                  <span>TOTAL ({receiptOrder.paymentMethod})</span>
                  <span className="tabular-nums">{formatMoney(receiptOrder.grandTotal, currency, 2)}</span>
                </div>
              </div>

              <div className="text-center text-[11px] text-slate-500 pt-2">
                Thank you for dining with us. Synced to Money Ledger.
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
