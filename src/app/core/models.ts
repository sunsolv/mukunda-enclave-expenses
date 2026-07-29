export type Role = 'emergency_admin' | 'owner';
export type ChargeStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type PaymentStatus = 'pending' | 'verified' | 'rejected';
export type ExpenseStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Profile {
  id: string;
  username: string;
  flatId: string | null;
  flatNumber?: string;
  ownerName: string;
  role: Role;
  accountStatus: 'active' | 'inactive';
  mustChangePassword: boolean;
  isCurrentAdmin: boolean;
}

export interface Flat {
  id: string;
  flatNumber: string;
  floor: string;
  ownerName: string;
  mobile?: string;
  maintenanceAmount: number;
  active: boolean;
}

export interface MaintenanceCharge {
  id: string;
  flatId: string;
  flatNumber: string;
  billingMonth: string;
  baseAmount: number;
  previousBalance: number;
  lateFee: number;
  discount: number;
  adjustment: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  dueDate: string;
  status: ChargeStatus;
}

export interface Payment {
  id: string;
  flatId: string;
  flatNumber: string;
  maintenanceChargeId: string;
  receiptNumber: string | null;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  transactionReference: string;
  verificationStatus: PaymentStatus;
  notes?: string;
  rejectionReason?: string;
  cancelled?: boolean;
}

export interface Expense {
  id: string;
  expenseDate: string;
  category: string;
  baseCategory?: string;
  customCategory?: string;
  vendorName: string;
  description: string;
  amount: number;
  paymentMode: string;
  status: ExpenseStatus;
  transactionReference?: string;
  notes?: string;
  rejectionReason?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Responsibility {
  id: string;
  responsibilityYear: number;
  flatNumber: string;
  ownerName: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number | null;
  status: 'upcoming' | 'current' | 'completed';
}

export interface DashboardSummary {
  openingBalance: number;
  billed: number;
  collected: number;
  pending: number;
  expenses: number;
  closingBalance: number;
  paidFlats: number;
  partialFlats: number;
  pendingFlats: number;
  overdueFlats: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  username: string;
  reason?: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  entityType: 'payment' | 'expense';
  entityId: string;
  documentType: 'payment_proof' | 'official_receipt' | 'expense_bill' | 'legacy_link';
  originalFilename: string;
  sizeBytes: number;
  legacyDocumentUrl?: string;
  createdAt: string;
}

export interface StagedDocument {
  storage_path: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  size_bytes: number;
}
