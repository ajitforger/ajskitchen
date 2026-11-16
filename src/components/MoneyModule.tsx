import { useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  CurrencyCode,
  LedgerEntry,
  LedgerEntryType,
  LedgerStatus,
  PaymentMethod,
  Vendor,
} from '../types';
import {
  clampNum,
  clampStr,
  downloadCsv,
  formatDateShort,
  formatMoney,
  todayISO,
} from '../utils/format';

interface MoneyModuleProps {
  ownerId: string;
  currency: CurrencyCode;
  ledgerEntries: LedgerEntry[];
  vendors: Vendor[];
}

const INCOME_CATEGORIES = [
  'Dine-in Settlement',
  'Catering & Events',
  'Delivery Payout',
  'Counter Coffee & Parcel',
  'Other Income',
];

const EXPENSE_CATEGORIES = [
  'Grains & Pulses',
  'Dairy & Ghee',
  'Produce & Coconut',
  'Coffee & Spices',
  'Staff Payroll',
  'Gas & Utilities',
  'Rent & Facility',
  'Vendor Settlement',
  'Packaging & Supplies',
];

const PAYMENT_METHODS: PaymentMethod[] = [
  'UPI / QR',
  'Cash',
  'Bank Transfer',
  'Card Settlement',
  'Aggregator Payout',
];

export function MoneyModule({
  ownerId,
  currency,
  ledgerEntries,
  vendors,
}: MoneyModuleProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | LedgerEntryType>('all');
  const [methodFilter, setMethodFilter] = useState<'All' | PaymentMethod>('All');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [entryType, setEntryType] = useState<LedgerEntryType>('income');
  const [category, setCategory] = useState(INCOME_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI / QR');
  const [entryDate, setEntryDate] = useState(todayISO());
  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<LedgerStatus>('cleared');

  const activeEntries = ledgerEntries.filter((e) => e.status !== 'voided');
  const totalInflow = activeEntries
    .filter((e) => e.entryType === 'income' && e.status === 'cleared')
    .reduce((s, e) => s + e.amount, 0);
  const totalOutflow = activeEntries
    .filter((e) => e.entryType === 'expense' && e.status === 'cleared')
    .reduce((s, e) => s + e.amount, 0);
  const pendingTotal = activeEntries
    .filter((e) => e.status === 'pending')
    .reduce((s, e) => s + (e.entryType === 'income' ? e.amount : -e.amount), 0);
  const netBalance = totalInflow - totalOutflow;

  const filtered = [...ledgerEntries]
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
    .filter((e) => {
      const matchesType = typeFilter === 'all' || e.entryType === typeFilter;
      const matchesMethod = methodFilter === 'All' || e.paymentMethod === methodFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q);
      return matchesType && matchesMethod && matchesSearch;
    });

  const openCreate = (defaultType: LedgerEntryType = 'income') => {
    setEditingEntry(null);
    setTitle('');
    setEntryType(defaultType);
    setCategory(defaultType === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
    setAmount('');
    setPaymentMethod('UPI / QR');
    setEntryDate(todayISO());
    setVendorId('');
    setNotes('');
    setStatus('cleared');
    setModalOpen(true);
  };

  const openEdit = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setTitle(entry.title);
    setEntryType(entry.entryType);
    setCategory(entry.category);
    setAmount(String(entry.amount));
    setPaymentMethod(entry.paymentMethod);
    setEntryDate(entry.entryDate);
    setVendorId(entry.vendorId || '');
    setNotes(entry.notes || '');
    setStatus(entry.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = clampStr(title, 160);
    const numAmount = clampNum(Number(amount) || 0, 0.01, 100000000);
    if (!cleanTitle || numAmount <= 0) return;

    const payload = {
      ownerId,
      title: cleanTitle,
      entryType,
      category: clampStr(category, 64) || 'Other',
      amount: numAmount,
      paymentMethod,
      entryDate: clampStr(entryDate, 20) || todayISO(),
      vendorId: clampStr(vendorId, 128),
      notes: clampStr(notes, 400),
      status,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editingEntry) {
        await updateDoc(doc(db, 'ledgerEntries', editingEntry.id), payload);
      } else {
        const ref = doc(collection(db, 'ledgerEntries'));
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingEntry ? OperationType.UPDATE : OperationType.CREATE,
        'ledgerEntries'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMarkCleared = async (entry: LedgerEntry) => {
    try {
      await updateDoc(doc(db, 'ledgerEntries', entry.id), {
        status: 'cleared',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ledgerEntries/${entry.id}`);
    }
  };

  const handleVoid = async (entry: LedgerEntry) => {
    try {
      await updateDoc(doc(db, 'ledgerEntries', entry.id), {
        status: 'voided',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ledgerEntries/${entry.id}`);
    }
  };

  const handleDelete = async (entry: LedgerEntry) => {
    try {
      await deleteDoc(doc(db, 'ledgerEntries', entry.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ledgerEntries/${entry.id}`);
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      `dakshin-ledger-${todayISO()}.csv`,
      ['Date', 'Title', 'Type', 'Category', 'Method', 'Status', 'Amount', 'Notes'],
      filtered.map((item) => [
        item.entryDate,
        item.title,
        item.entryType,
        item.category,
        item.paymentMethod,
        item.status,
        item.entryType === 'income' ? item.amount : -item.amount,
        item.notes,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
            Money Management &amp; Cash Ledger
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Reconcile daily dine-in settlements, catering deposits, aggregator payouts, payroll, and ingredient bills.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => openCreate('expense')}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4 text-red-600" />
            Log Expense
          </button>
          <button
            type="button"
            onClick={() => openCreate('income')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Log Income
          </button>
        </div>
      </div>

      {/* 4-Card Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Cleared Inflow</div>
          <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {formatMoney(totalInflow, currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Cleared Outflow</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatMoney(totalOutflow, currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Net Cash Position</div>
          <div className={`text-2xl font-bold font-mono tabular-nums ${netBalance >= 0 ? 'text-slate-900' : 'text-red-700'}`}>
            {formatMoney(netBalance, currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Pending Net Settlements</div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {formatMoney(pendingTotal, currency)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'income', 'expense'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  typeFilter === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {t === 'all' ? 'All Entries' : t === 'income' ? 'Income' : 'Expenses'}
              </button>
            ))}
          </div>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as 'All' | PaymentMethod)}
            className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-emerald-700"
          >
            <option value="All">All Payment Modes</option>
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ledger..."
            className="pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-700"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <th className="text-left font-medium px-6 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Description &amp; Category</th>
                <th className="text-left font-medium px-4 py-3">Mode</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-right font-medium px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                    No cash ledger entries found for this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => {
                  const isIncome = entry.entryType === 'income';
                  const isVoided = entry.status === 'voided';
                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-slate-50/70 transition-colors ${isVoided ? 'opacity-55' : ''}`}
                    >
                      <td className="px-6 py-3.5 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {formatDateShort(entry.entryDate)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {isIncome ? (
                            <ArrowDownLeft className="w-4 h-4 text-emerald-700 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-red-600 shrink-0" />
                          )}
                          <span className={`font-medium text-slate-900 ${isVoided ? 'line-through' : ''}`}>
                            {entry.title}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 pl-6">
                          {entry.category}
                          {entry.notes ? ` · ${entry.notes}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        {entry.paymentMethod}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium whitespace-nowrap">
                        <span
                          className={
                            entry.status === 'cleared'
                              ? 'text-emerald-700'
                              : entry.status === 'pending'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }
                        >
                          {entry.status === 'cleared'
                            ? 'Cleared'
                            : entry.status === 'pending'
                            ? 'Pending'
                            : 'Voided'}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          isVoided
                            ? 'text-slate-400 line-through'
                            : isIncome
                            ? 'text-emerald-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {formatMoney(entry.amount, currency)}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {entry.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => handleMarkCleared(entry)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-md hover:bg-slate-100 cursor-pointer"
                              title="Mark cleared"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {!isVoided && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(entry)}
                                className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-md hover:bg-slate-100 cursor-pointer"
                                title="Edit entry"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVoid(entry)}
                                className="p-1.5 text-slate-500 hover:text-amber-700 rounded-md hover:bg-slate-100 cursor-pointer"
                                title="Void entry"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(entry)}
                            className="p-1.5 text-slate-500 hover:text-red-700 rounded-md hover:bg-slate-100 cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingEntry ? 'Edit Ledger Entry' : 'Record Money Entry'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setEntryType('income');
                    setCategory(INCOME_CATEGORIES[0]);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    entryType === 'income' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Income / Inflow
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntryType('expense');
                    setCategory(EXPENSE_CATEGORIES[0]);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    entryType === 'expense' ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Expense / Outflow
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Morning Tiffin Settlement or A2 Ghee Restock"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {(entryType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as LedgerStatus)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="cleared">Cleared</option>
                    <option value="pending">Pending</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Linked Vendor (Optional)
                  </label>
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">None</option>
                    {vendors
                      .filter((v) => v.status !== 'archived')
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  maxLength={400}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Invoice ref, shift notes, etc."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
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
                  {saving ? 'Saving...' : editingEntry ? 'Save Changes' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
