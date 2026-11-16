export type CurrencyCode = 'INR' | 'USD';

export type NavSection =
  | 'overview'
  | 'pos'
  | 'menu'
  | 'money'
  | 'vendors'
  | 'calculators'
  | 'planner';

export interface UserProfile {
  uid: string;
  restaurantName: string;
  ownerName: string;
  currency: CurrencyCode;
  seededDefaults: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type MenuCategory =
  | 'Tiffin & Dosas'
  | 'Meals & Rice'
  | 'Curries & Sides'
  | 'Filter Coffee & Drinks'
  | 'Sweets & Bakery';

export type MenuStatus = 'active' | 'seasonal' | 'archived';

export interface MenuIngredient {
  name: string;
  qty: string;
  unitCost: number;
}

export interface MenuItem {
  id: string;
  ownerId: string;
  name: string;
  regionalName: string;
  category: MenuCategory;
  sellingPrice: number;
  recipeCost: number;
  packagingCost: number;
  prepMinutes: number;
  monthlyUnits: number;
  imageKey: string;
  ingredients: MenuIngredient[];
  status: MenuStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type VendorCategory =
  | 'Grains & Pulses'
  | 'Dairy & Ghee'
  | 'Produce & Coconut'
  | 'Coffee & Spices'
  | 'Fuel & Packaging';

export type PaymentTerms = 'COD' | 'Net 7' | 'Net 15' | 'Net 30';

export type VendorStatus = 'active' | 'paused' | 'archived';

export interface Vendor {
  id: string;
  ownerId: string;
  name: string;
  category: VendorCategory;
  contactPerson: string;
  phone: string;
  paymentTerms: PaymentTerms;
  outstandingBalance: number;
  totalPurchases: number;
  lastOrderDate: string;
  notes: string;
  status: VendorStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type LedgerEntryType = 'income' | 'expense';

export type PaymentMethod =
  | 'UPI / QR'
  | 'Cash'
  | 'Bank Transfer'
  | 'Card Settlement'
  | 'Aggregator Payout';

export type LedgerStatus = 'cleared' | 'pending' | 'voided';

export interface LedgerEntry {
  id: string;
  ownerId: string;
  title: string;
  entryType: LedgerEntryType;
  category: string;
  amount: number;
  paymentMethod: PaymentMethod;
  entryDate: string;
  vendorId: string;
  notes: string;
  status: LedgerStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type KitchenStation =
  | 'Dosa & Tawa'
  | 'Batter & Grinding'
  | 'Sambar & Chutneys'
  | 'Filter Coffee'
  | 'Procurement & Floor';

export type PlannerTaskType =
  | 'Batter Prep'
  | 'Shift Roster'
  | 'Vendor Delivery'
  | 'Catering Prep'
  | 'Maintenance';

export type PlannerPriority = 'high' | 'medium' | 'low';

export type PlannerStatus = 'planned' | 'in_progress' | 'completed';

export interface PlannerTask {
  id: string;
  ownerId: string;
  title: string;
  station: KitchenStation;
  taskType: PlannerTaskType;
  scheduledDate: string;
  scheduledTime: string;
  assignee: string;
  priority: PlannerPriority;
  notes: string;
  status: PlannerStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CalculatorType =
  | 'Daily Profit'
  | 'Break-Even'
  | 'Menu Pricing'
  | 'Catering Quote'
  | 'Batter Yield';

export interface CalcScenario {
  id: string;
  ownerId: string;
  name: string;
  calculatorType: CalculatorType;
  inputsSummary: string;
  projectedRevenue: number;
  projectedProfit: number;
  marginPercent: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PosOrderType = 'dine_in' | 'parcel' | 'catering_counter';

export type PosOrderStatus = 'kot_open' | 'preparing' | 'ready' | 'paid' | 'cancelled';

export interface PosOrderItem {
  menuItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  packagingCost: number;
  note: string;
}

export interface PosOrder {
  id: string;
  ownerId: string;
  orderNumber: string;
  orderType: PosOrderType;
  tableLabel: string;
  customerName: string;
  items: PosOrderItem[];
  subtotal: number;
  packagingTotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  kitchenNotes: string;
  status: PosOrderStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

