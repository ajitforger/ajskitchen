import { useState } from 'react';
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
  Archive,
  CreditCard,
  Edit3,
  FilePlus2,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  CurrencyCode,
  PaymentMethod,
  PaymentTerms,
  Vendor,
  VendorCategory,
  VendorStatus,
} from '../types';
import { clampNum, clampStr, formatDateShort, formatMoney, todayISO } from '../utils/format';

interface VendorsModuleProps {
  ownerId: string;
  currency: CurrencyCode;
  vendors: Vendor[];
}

const VENDOR_CATEGORIES: VendorCategory[] = [
  'Grains & Pulses',
  'Dairy & Ghee',
  'Produce & Coconut',
  'Coffee & Spices',
  'Fuel & Packaging',
];

const PAYMENT_TERMS: PaymentTerms[] = ['COD', 'Net 7', 'Net 15', 'Net 30'];

export function VendorsModule({ ownerId, currency, vendors }: VendorsModuleProps) {
  const [catFilter, setCatFilter] = useState<'All' | VendorCategory>('All');
  const [search, setSearch] = useState('');

  // Vendor CRUD modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<VendorCategory>('Grains & Pulses');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('Net 15');
  const [outstandingBalance, setOutstandingBalance] = useState('0');
  const [totalPurchases, setTotalPurchases] = useState('0');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<VendorStatus>('active');

  // Bill / Settlement drawer modal
  const [txModalVendor, setTxModalVendor] = useState<Vendor | null>(null);
  const [txMode, setTxMode] = useState<'bill' | 'payment'>('bill');
  const [txAmount, setTxAmount] = useState('');
  const [txMethod, setTxMethod] = useState<PaymentMethod>('Bank Transfer');
  const [txNote, setTxNote] = useState('');
  const [txSyncLedger, setTxSyncLedger] = useState(true);

  const activeVendors = vendors.filter((v) => v.status !== 'archived');
  const totalPayables = activeVendors.reduce((s, v) => s + v.outstandingBalance, 0);
  const totalSpend = activeVendors.reduce((s, v) => s + v.totalPurchases, 0);

  const filtered = vendors.filter((v) => {
    const matchesCat = catFilter === 'All' || v.category === catFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      v.name.toLowerCase().includes(q) ||
      v.contactPerson.toLowerCase().includes(q) ||
      v.notes.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const openCreate = () => {
    setEditingVendor(null);
    setName('');
    setCategory('Grains & Pulses');
    setContactPerson('');
    setPhone('');
    setPaymentTerms('Net 15');
    setOutstandingBalance('0');
    setTotalPurchases('0');
    setNotes('');
    setStatus('active');
    setModalOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditingVendor(v);
    setName(v.name);
    setCategory(v.category);
    setContactPerson(v.contactPerson);
    setPhone(v.phone);
    setPaymentTerms(v.paymentTerms);
    setOutstandingBalance(String(v.outstandingBalance));
    setTotalPurchases(String(v.totalPurchases));
    setNotes(v.notes);
    setStatus(v.status);
    setModalOpen(true);
  };

  const openTxModal = (v: Vendor, mode: 'bill' | 'payment') => {
    setTxModalVendor(v);
    setTxMode(mode);
    setTxAmount(mode === 'payment' && v.outstandingBalance > 0 ? String(v.outstandingBalance) : '');
    setTxMethod('Bank Transfer');
    setTxNote('');
    setTxSyncLedger(mode === 'payment');
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clampStr(name, 120);
    if (!cleanName) return;

    const payload = {
      ownerId,
      name: cleanName,
      category,
      contactPerson: clampStr(contactPerson, 100),
      phone: clampStr(phone, 32),
      paymentTerms,
      outstandingBalance: clampNum(Number(outstandingBalance) || 0, 0, 100000000),
      totalPurchases: clampNum(Number(totalPurchases) || 0, 0, 1000000000),
      lastOrderDate: editingVendor?.lastOrderDate || todayISO(),
      notes: clampStr(notes, 400),
      status,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editingVendor) {
        await updateDoc(doc(db, 'vendors', editingVendor.id), payload);
      } else {
        const ref = doc(collection(db, 'vendors'));
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingVendor ? OperationType.UPDATE : OperationType.CREATE,
        'vendors'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRecordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txModalVendor) return;
    const amt = clampNum(Number(txAmount) || 0, 0.01, 100000000);
    if (amt <= 0) return;

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const vendorRef = doc(db, 'vendors', txModalVendor.id);

      if (txMode === 'bill') {
        batch.update(vendorRef, {
          outstandingBalance: clampNum(txModalVendor.outstandingBalance + amt, 0, 100000000),
          totalPurchases: clampNum(txModalVendor.totalPurchases + amt, 0, 1000000000),
          lastOrderDate: todayISO(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(vendorRef, {
          outstandingBalance: clampNum(txModalVendor.outstandingBalance - amt, 0, 100000000),
          totalPurchases: txModalVendor.totalPurchases,
          lastOrderDate: txModalVendor.lastOrderDate || todayISO(),
          updatedAt: serverTimestamp(),
        });
      }

      if (txSyncLedger) {
        const ledgerRef = doc(collection(db, 'ledgerEntries'));
        batch.set(ledgerRef, {
          ownerId,
          title: clampStr(
            txMode === 'payment'
              ? `Vendor Payment — ${txModalVendor.name}`
              : `Supply Bill — ${txModalVendor.name}`,
            160
          ),
          entryType: 'expense',
          category: txMode === 'payment' ? 'Vendor Settlement' : txModalVendor.category,
          amount: amt,
          paymentMethod: txMethod,
          entryDate: todayISO(),
          vendorId: txModalVendor.id,
          notes: clampStr(txNote || `${txMode === 'payment' ? 'Payable settled' : 'Invoice recorded'}`, 400),
          status: txMode === 'payment' ? 'cleared' : 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setTxModalVendor(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `vendors/${txModalVendor.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (v: Vendor) => {
    try {
      await updateDoc(doc(db, 'vendors', v.id), {
        status: 'archived',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vendors/${v.id}`);
    }
  };

  const handleDelete = async (v: Vendor) => {
    try {
      await deleteDoc(doc(db, 'vendors', v.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vendors/${v.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
            Vendors &amp; Supply Chain
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage rice &amp; dal mills, dairy &amp; ghee suppliers, coconut &amp; banana leaf markets, and coffee roasters.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Vendor
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Active Suppliers</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {activeVendors.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Total Payables Due</div>
          <div className={`text-2xl font-bold font-mono tabular-nums ${totalPayables > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {formatMoney(totalPayables, currency)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Cumulative Purchases</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatMoney(totalSpend, currency)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['All', ...VENDOR_CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                catFilter === cat ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier or item..."
            className="pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
          />
        </div>
      </div>

      {/* Vendor Directory Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <th className="text-left font-medium px-6 py-3">Supplier &amp; Supplies</th>
                <th className="text-left font-medium px-4 py-3">Contact &amp; Terms</th>
                <th className="text-right font-medium px-4 py-3">Balance Due</th>
                <th className="text-right font-medium px-4 py-3">Total Spend</th>
                <th className="text-right font-medium px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">
                    No suppliers match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">
                        {vendor.name}
                        {vendor.status === 'archived' && (
                          <span className="ml-2 text-xs font-normal text-slate-400">(Archived)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {vendor.category}
                        {vendor.notes ? ` · ${vendor.notes}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-slate-800">{vendor.contactPerson || '—'}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        {vendor.phone && (
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Phone className="w-3 h-3" />
                            {vendor.phone}
                          </span>
                        )}
                        <span>· {vendor.paymentTerms}</span>
                        <span>· Last {formatDateShort(vendor.lastOrderDate)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono tabular-nums font-semibold">
                      <span className={vendor.outstandingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                        {formatMoney(vendor.outstandingBalance, currency)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono tabular-nums text-slate-700">
                      {formatMoney(vendor.totalPurchases, currency)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {vendor.status !== 'archived' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openTxModal(vendor, 'bill')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                            >
                              <FilePlus2 className="w-3.5 h-3.5" />
                              Bill
                            </button>
                            <button
                              type="button"
                              onClick={() => openTxModal(vendor, 'payment')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md cursor-pointer"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Pay
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(vendor)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-md hover:bg-slate-100 cursor-pointer"
                              title="Edit vendor"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchive(vendor)}
                              className="p-1.5 text-slate-500 hover:text-amber-700 rounded-md hover:bg-slate-100 cursor-pointer"
                              title="Archive vendor"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(vendor)}
                          className="p-1.5 text-slate-500 hover:text-red-700 rounded-md hover:bg-slate-100 cursor-pointer"
                          title="Delete vendor"
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

      {/* Vendor Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingVendor ? 'Edit Vendor' : 'Add Restaurant Supplier'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVendor} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Supplier Name</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Salem Idli Rice Traders"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as VendorCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {VENDOR_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Credit Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {PAYMENT_TERMS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    maxLength={32}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Current Balance Due
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={outstandingBalance}
                    onChange={(e) => setOutstandingBalance(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cumulative Purchases
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalPurchases}
                    onChange={(e) => setTotalPurchases(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Supplied Items &amp; Notes</label>
                <input
                  type="text"
                  maxLength={400}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., 25kg Ponni rice bags, 5:30 AM milk drop"
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
                  {saving ? 'Saving...' : editingVendor ? 'Save Vendor' : 'Create Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bill / Payment Modal */}
      {txModalVendor && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {txMode === 'bill' ? 'Record Supply Bill' : 'Settle Vendor Payment'}
                </h2>
                <p className="text-xs text-slate-500">{txModalVendor.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setTxModalVendor(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordTx} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Amount (Current Due: {formatMoney(txModalVendor.outstandingBalance, currency)})
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={txMethod}
                  onChange={(e) => setTxMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="UPI / QR">UPI / QR</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reference / Invoice Note</label>
                <input
                  type="text"
                  maxLength={300}
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  placeholder="e.g., Invoice #CR-902 · 10 bags Idli rice"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={txSyncLedger}
                  onChange={(e) => setTxSyncLedger(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                />
                Also record this transaction in Money Management Ledger
              </label>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTxModalVendor(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Updating...' : txMode === 'bill' ? 'Add to Payable' : 'Confirm Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
