import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { calculateClosingBalance, fileValidationError } from './financial.utils';
import {
  AuditEntry,
  DashboardSummary,
  DocumentRecord,
  Expense,
  Flat,
  MaintenanceCharge,
  Payment,
  Responsibility,
  StagedDocument,
} from './models';

const today = new Date();
const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const date = (day: number) => `${month}-${String(day).padStart(2, '0')}`;

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly auth = inject(AuthService);
  private readonly demoOperationIds = new Map<string, string>();
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly flats = signal<Flat[]>([
    {
      id: 'flat-101',
      flatNumber: '101',
      floor: 'Ground',
      ownerName: 'K V Reddy Prasad',
      maintenanceAmount: 2500,
      active: true,
    },
    {
      id: 'flat-102',
      flatNumber: '102',
      floor: 'Ground',
      ownerName: 'Meera Iyer',
      maintenanceAmount: 2500,
      active: true,
    },
    {
      id: 'flat-201',
      flatNumber: '201',
      floor: 'First',
      ownerName: 'Kiran Shah',
      maintenanceAmount: 2750,
      active: true,
    },
    {
      id: 'flat-202',
      flatNumber: '202',
      floor: 'First',
      ownerName: 'Nisha Reddy',
      maintenanceAmount: 2750,
      active: true,
    },
  ]);
  readonly charges = signal<MaintenanceCharge[]>([
    {
      id: 'c1',
      flatId: 'flat-101',
      flatNumber: '101',
      billingMonth: month,
      baseAmount: 2500,
      previousBalance: 0,
      lateFee: 0,
      discount: 0,
      adjustment: 0,
      totalAmount: 2500,
      paidAmount: 2500,
      balanceAmount: 0,
      dueDate: date(10),
      status: 'paid',
    },
    {
      id: 'c2',
      flatId: 'flat-102',
      flatNumber: '102',
      billingMonth: month,
      baseAmount: 2500,
      previousBalance: 500,
      lateFee: 0,
      discount: 0,
      adjustment: 0,
      totalAmount: 3000,
      paidAmount: 1500,
      balanceAmount: 1500,
      dueDate: date(10),
      status: 'partially_paid',
    },
    {
      id: 'c3',
      flatId: 'flat-201',
      flatNumber: '201',
      billingMonth: month,
      baseAmount: 2750,
      previousBalance: 0,
      lateFee: 0,
      discount: 0,
      adjustment: 0,
      totalAmount: 2750,
      paidAmount: 0,
      balanceAmount: 2750,
      dueDate: date(10),
      status: 'overdue',
    },
    {
      id: 'c4',
      flatId: 'flat-202',
      flatNumber: '202',
      billingMonth: month,
      baseAmount: 2750,
      previousBalance: 0,
      lateFee: 0,
      discount: 0,
      adjustment: 0,
      totalAmount: 2750,
      paidAmount: 0,
      balanceAmount: 2750,
      dueDate: date(10),
      status: 'overdue',
    },
  ]);
  readonly payments = signal<Payment[]>([
    {
      id: 'p1',
      flatId: 'flat-101',
      flatNumber: '101',
      maintenanceChargeId: 'c1',
      receiptNumber: `ME-${month.replace('-', '')}-0001`,
      paymentDate: date(5),
      amount: 2500,
      paymentMode: 'UPI',
      transactionReference: 'UPI778210',
      verificationStatus: 'verified',
    },
    {
      id: 'p2',
      flatId: 'flat-102',
      flatNumber: '102',
      maintenanceChargeId: 'c2',
      receiptNumber: `ME-${month.replace('-', '')}-0002`,
      paymentDate: date(7),
      amount: 1500,
      paymentMode: 'bank_transfer',
      transactionReference: 'NEFT32901',
      verificationStatus: 'verified',
    },
    {
      id: 'p3',
      flatId: 'flat-202',
      flatNumber: '202',
      maintenanceChargeId: 'c4',
      receiptNumber: null,
      paymentDate: date(9),
      amount: 2750,
      paymentMode: 'UPI',
      transactionReference: 'UPI882311',
      verificationStatus: 'pending',
    },
  ]);
  readonly expenses = signal<Expense[]>([
    {
      id: 'e1',
      expenseDate: date(3),
      category: 'Security',
      vendorName: 'SecureOne Services',
      description: 'Monthly security service',
      amount: 6200,
      paymentMode: 'bank_transfer',
      status: 'approved',
    },
    {
      id: 'e2',
      expenseDate: date(6),
      category: 'Common Electricity',
      vendorName: 'TSSPDCL',
      description: 'Common area electricity',
      amount: 1840,
      paymentMode: 'UPI',
      status: 'approved',
    },
    {
      id: 'e3',
      expenseDate: date(8),
      category: 'Plumbing',
      vendorName: 'Sai Plumbing',
      description: 'Overhead tank valve repair',
      amount: 950,
      paymentMode: 'cash',
      status: 'pending',
    },
  ]);
  readonly responsibilities = signal<Responsibility[]>([
    {
      id: 'r1',
      responsibilityYear: today.getFullYear() - 1,
      flatNumber: '202',
      ownerName: 'Nisha Reddy',
      startDate: `${today.getFullYear() - 1}-01-01`,
      endDate: `${today.getFullYear() - 1}-12-31`,
      openingBalance: 12750,
      closingBalance: 18420,
      status: 'completed',
    },
    {
      id: 'r2',
      responsibilityYear: today.getFullYear(),
      flatNumber: '101',
      ownerName: 'K V Reddy Prasad',
      startDate: `${today.getFullYear()}-01-01`,
      endDate: `${today.getFullYear()}-12-31`,
      openingBalance: 18420,
      closingBalance: null,
      status: 'current',
    },
    {
      id: 'r3',
      responsibilityYear: today.getFullYear() + 1,
      flatNumber: '102',
      ownerName: 'Meera Iyer',
      startDate: `${today.getFullYear() + 1}-01-01`,
      endDate: `${today.getFullYear() + 1}-12-31`,
      openingBalance: 0,
      closingBalance: null,
      status: 'upcoming',
    },
  ]);
  readonly documents = signal<DocumentRecord[]>([
    {
      id: 'd1',
      entityType: 'payment',
      entityId: 'p1',
      documentType: 'official_receipt',
      originalFilename: `ME-${month.replace('-', '')}-0001.pdf`,
      sizeBytes: 48210,
      createdAt: `${date(5)}T10:30:00+05:30`,
    },
    {
      id: 'd2',
      entityType: 'expense',
      entityId: 'e1',
      documentType: 'expense_bill',
      originalFilename: 'security-service-invoice.pdf',
      sizeBytes: 214800,
      createdAt: `${date(3)}T13:10:00+05:30`,
    },
  ]);
  readonly auditLogs = signal<AuditEntry[]>([
    {
      id: 'a1',
      action: 'payment.verified',
      entityType: 'payment',
      entityId: 'p1',
      username: 'flat101',
      createdAt: `${date(5)}T10:30:00+05:30`,
    },
    {
      id: 'a2',
      action: 'expense.approved',
      entityType: 'expense',
      entityId: 'e1',
      username: 'flat101',
      createdAt: `${date(3)}T13:10:00+05:30`,
    },
  ]);

  readonly summary = computed<DashboardSummary>(() => {
    const activeCharges = this.charges().filter((item) => item.status !== 'cancelled');
    const collected = this.payments()
      .filter((item) => item.verificationStatus === 'verified' && !item.cancelled)
      .reduce((sum, item) => sum + item.amount, 0);
    const expenses = this.expenses()
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + item.amount, 0);
    const openingBalance =
      this.responsibilities().find((item) => item.status === 'current')?.openingBalance ?? 0;
    return {
      openingBalance,
      billed: activeCharges.reduce((sum, item) => sum + item.totalAmount, 0),
      collected,
      pending: activeCharges.reduce((sum, item) => sum + item.balanceAmount, 0),
      expenses,
      closingBalance: calculateClosingBalance(openingBalance, collected, expenses),
      paidFlats: activeCharges.filter((item) => item.status === 'paid').length,
      partialFlats: activeCharges.filter((item) => item.status === 'partially_paid').length,
      pendingFlats: activeCharges.filter((item) => item.status === 'unpaid').length,
      overdueFlats: activeCharges.filter((item) => item.status === 'overdue').length,
    };
  });

  async refresh(): Promise<void> {
    if (!this.auth.supabase) return;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const results = await Promise.all([
        this.auth.supabase
          .from('flats')
          .select('id,flat_number,floor,owner_name,mobile,maintenance_amount,active')
          .order('flat_number'),
        this.auth.supabase
          .from('maintenance_charges')
          .select(
            'id,flat_id,billing_month,base_amount,previous_balance,late_fee,discount,adjustment,total_amount,paid_amount,balance_amount,due_date,status,flats(flat_number)',
          )
          .order('billing_month', { ascending: false }),
        this.auth.supabase
          .from('payments')
          .select(
            'id,flat_id,maintenance_charge_id,receipt_number,payment_date,amount,payment_mode,transaction_reference,verification_status,notes,rejection_reason,cancelled_at,flats(flat_number)',
          )
          .order('payment_date', { ascending: false }),
        this.auth.supabase
          .from('expenses')
          .select(
            'id,expense_date,vendor_name,description,amount,payment_mode,transaction_reference,status,notes,rejection_reason,other_category,updated_at,updated_by,expense_categories(name)',
          )
          .is('deleted_at', null)
          .order('expense_date', { ascending: false }),
        this.auth.supabase
          .from('maintenance_responsibilities')
          .select(
            'id,responsibility_year,start_date,end_date,opening_balance,closing_balance,status,flats(flat_number),profiles!maintenance_responsibilities_owner_profile_id_fkey(owner_name)',
          )
          .order('responsibility_year', { ascending: false }),
        this.auth.supabase
          .from('documents')
          .select(
            'id,entity_type,entity_id,document_type,original_filename,size_bytes,legacy_document_url,created_at',
          )
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        this.auth.supabase
          .from('audit_logs')
          .select('id,action,entity_type,entity_id,reason,created_at,profiles(username)')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      const [
        flatResult,
        chargeResult,
        paymentResult,
        expenseResult,
        responsibilityResult,
        documentResult,
        auditResult,
      ] = results.map((result) => result.data as any[]);
      const joined = (value: any): any => (Array.isArray(value) ? value[0] : value) ?? {};

      this.flats.set(
        flatResult.map((item) => ({
          id: item.id,
          flatNumber: item.flat_number,
          floor: item.floor,
          ownerName: item.owner_name,
          mobile: item.mobile ?? undefined,
          maintenanceAmount: Number(item.maintenance_amount),
          active: item.active,
        })),
      );
      this.charges.set(
        chargeResult.map((item) => ({
          id: item.id,
          flatId: item.flat_id,
          flatNumber: joined(item.flats).flat_number,
          billingMonth: item.billing_month.slice(0, 7),
          baseAmount: Number(item.base_amount),
          previousBalance: Number(item.previous_balance),
          lateFee: Number(item.late_fee),
          discount: Number(item.discount),
          adjustment: Number(item.adjustment),
          totalAmount: Number(item.total_amount),
          paidAmount: Number(item.paid_amount),
          balanceAmount: Number(item.balance_amount),
          dueDate: item.due_date,
          status: item.status,
        })),
      );
      this.payments.set(
        paymentResult.map((item) => ({
          id: item.id,
          flatId: item.flat_id,
          flatNumber: joined(item.flats).flat_number,
          maintenanceChargeId: item.maintenance_charge_id,
          receiptNumber: item.receipt_number,
          paymentDate: item.payment_date,
          amount: Number(item.amount),
          paymentMode: item.payment_mode,
          transactionReference: item.transaction_reference ?? '',
          verificationStatus: item.verification_status,
          notes: item.notes ?? undefined,
          rejectionReason: item.rejection_reason ?? undefined,
          cancelled: Boolean(item.cancelled_at),
        })),
      );
      this.expenses.set(
        expenseResult.map((item) => {
          const baseCategory = joined(item.expense_categories).name ?? 'Other';
          return {
            id: item.id,
            expenseDate: item.expense_date,
            category: item.other_category || baseCategory,
            baseCategory,
            customCategory: item.other_category ?? undefined,
            vendorName: item.vendor_name,
            description: item.description,
            amount: Number(item.amount),
            paymentMode: item.payment_mode,
            status: item.status,
            transactionReference: item.transaction_reference ?? undefined,
            notes: item.notes ?? undefined,
            rejectionReason: item.rejection_reason ?? undefined,
            updatedAt: item.updated_at ?? undefined,
            updatedBy: item.updated_by ?? undefined,
          };
        }),
      );
      this.responsibilities.set(
        responsibilityResult.map((item) => ({
          id: item.id,
          responsibilityYear: item.responsibility_year,
          flatNumber: joined(item.flats).flat_number,
          ownerName: joined(item.profiles).owner_name,
          startDate: item.start_date,
          endDate: item.end_date,
          openingBalance: Number(item.opening_balance),
          closingBalance: item.closing_balance === null ? null : Number(item.closing_balance),
          status: item.status,
        })),
      );
      this.documents.set(
        documentResult.map((item) => ({
          id: item.id,
          entityType: item.entity_type,
          entityId: item.entity_id,
          documentType: item.document_type,
          originalFilename: item.original_filename,
          sizeBytes: Number(item.size_bytes),
          legacyDocumentUrl: item.legacy_document_url ?? undefined,
          createdAt: item.created_at,
        })),
      );
      this.auditLogs.set(
        auditResult.map((item) => ({
          id: item.id,
          action: item.action,
          entityType: item.entity_type,
          entityId: item.entity_id ?? undefined,
          username: joined(item.profiles).username ?? 'system',
          reason: item.reason ?? undefined,
          createdAt: item.created_at,
        })),
      );
    } catch {
      this.loadError.set('Financial records could not be loaded. Check the connection and retry.');
    } finally {
      this.loading.set(false);
    }
  }

  async generateCharges(billingMonth: string, dueDate: string, amount: number): Promise<void> {
    this.assertManager();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Enter a valid monthly charge amount.');
    }
    if (this.auth.supabase) {
      const { error } = await this.auth.supabase.rpc('generate_monthly_charges', {
        p_billing_month: `${billingMonth}-01`,
        p_due_date: dueDate,
        p_base_amount: amount,
      });
      if (error) throw error;
      await this.refresh();
      return;
    }
    const duplicates = this.charges().some(
      (charge) => charge.billingMonth === billingMonth && charge.status !== 'cancelled',
    );
    if (duplicates) throw new Error('Charges already exist for this billing month.');
    const generated = this.flats()
      .filter((flat) => flat.active)
      .map((flat) => ({
        id: crypto.randomUUID(),
        flatId: flat.id,
        flatNumber: flat.flatNumber,
        billingMonth,
        baseAmount: amount,
        previousBalance: 0,
        lateFee: 0,
        discount: 0,
        adjustment: 0,
        totalAmount: amount,
        paidAmount: 0,
        balanceAmount: amount,
        dueDate,
        status: 'unpaid' as const,
      }));
    this.charges.update((items) => [...generated, ...items]);
    this.audit('maintenance.generated', 'maintenance_charge', billingMonth);
  }

  async addPayment(
    input: Omit<Payment, 'id' | 'receiptNumber' | 'verificationStatus' | 'flatNumber'>,
  ): Promise<string> {
    if (this.auth.supabase) {
      const { data, error } = await this.auth.supabase.rpc('record_payment', {
        p_charge_id: input.maintenanceChargeId,
        p_amount: input.amount,
        p_payment_date: input.paymentDate,
        p_payment_mode: input.paymentMode,
        p_transaction_reference: input.transactionReference || null,
      });
      if (error) throw error;
      await this.refresh();
      return data as string;
    }
    const flat = this.flats().find((item) => item.id === input.flatId);
    if (!flat) throw new Error('Flat not found.');
    const ownUpload = this.auth.profile()?.flatId === input.flatId;
    if (!ownUpload && !this.auth.canManage())
      throw new Error('You can record a payment only for your own flat.');
    const paymentId = crypto.randomUUID();
    this.payments.update((items) => [
      {
        ...input,
        id: paymentId,
        flatNumber: flat.flatNumber,
        receiptNumber: null,
        verificationStatus: 'pending',
      },
      ...items,
    ]);
    this.audit('payment.created', 'payment');
    return paymentId;
  }

  async verifyPayment(paymentId: string, verified: boolean, reason?: string): Promise<void> {
    this.assertManager();
    if (!verified && (!reason || reason.trim().length < 3)) {
      throw new Error('A rejection reason is required.');
    }
    if (this.auth.supabase) {
      const { error } = await this.auth.supabase.rpc('verify_payment', {
        p_payment_id: paymentId,
        p_approve: verified,
        p_reason: verified ? null : reason,
      });
      if (error) throw error;
      await this.refresh();
      return;
    }
    const payment = this.payments().find((item) => item.id === paymentId);
    if (!payment) return;
    this.payments.update((items) =>
      items.map((item) =>
        item.id === paymentId
          ? {
              ...item,
              verificationStatus: verified ? 'verified' : 'rejected',
              receiptNumber: verified
                ? `ME-${month.replace('-', '')}-${String(items.filter((p) => p.receiptNumber).length + 1).padStart(4, '0')}`
                : null,
              rejectionReason: verified ? undefined : reason,
            }
          : item,
      ),
    );
    if (verified) {
      this.recalculateCharge(payment.maintenanceChargeId);
    }
    this.audit(verified ? 'payment.verified' : 'payment.rejected', 'payment', paymentId, reason);
  }

  async addExpense(expense: Omit<Expense, 'id' | 'status'>, submit: boolean): Promise<string> {
    this.assertManager();
    if (this.auth.supabase) {
      const { data, error } = await this.auth.supabase.rpc('save_expense', {
        p_expense_date: expense.expenseDate,
        p_category_name: expense.baseCategory ?? expense.category,
        p_other_category: expense.customCategory || null,
        p_vendor_name: expense.vendorName,
        p_description: expense.description,
        p_amount: expense.amount,
        p_payment_mode: expense.paymentMode,
        p_transaction_reference: expense.transactionReference || null,
        p_notes: expense.notes || null,
        p_submit: submit,
      });
      if (error) throw error;
      await this.refresh();
      return data as string;
    }
    const expenseId = crypto.randomUUID();
    this.expenses.update((items) => [
      {
        ...expense,
        category: expense.customCategory || expense.category,
        id: expenseId,
        status: submit ? 'pending' : 'draft',
      },
      ...items,
    ]);
    this.audit(submit ? 'expense.submitted' : 'expense.created', 'expense');
    return expenseId;
  }

  async submitExpense(
    expense: Omit<Expense, 'id' | 'status'>,
    submit: boolean,
    files: File[],
    submissionKey: string,
  ): Promise<string> {
    this.assertManager();
    this.assertValidDocuments(files);
    if (!this.auth.supabase) {
      const existingId = this.demoOperationIds.get(`expense:${submissionKey}`);
      if (existingId) return existingId;
      const expenseId = await this.addExpense(expense, submit);
      for (const file of files) {
        await this.uploadDocument(file, 'expense', expenseId, 'expense_bill');
      }
      this.demoOperationIds.set(`expense:${submissionKey}`, expenseId);
      return expenseId;
    }

    const staged = await this.stageDocuments(files, submissionKey);
    let data: string | null = null;
    let error: unknown;
    try {
      const result = await this.auth.supabase.rpc('submit_expense_with_documents', {
        p_expense_date: expense.expenseDate,
        p_category_name: expense.baseCategory ?? expense.category,
        p_other_category: expense.customCategory || null,
        p_vendor_name: expense.vendorName,
        p_description: expense.description,
        p_amount: expense.amount,
        p_payment_mode: expense.paymentMode,
        p_transaction_reference: expense.transactionReference || null,
        p_notes: expense.notes || null,
        p_submit: submit,
        p_submission_key: submissionKey,
        p_documents: staged,
      });
      data = result.data as string | null;
      error = result.error;
    } catch (caught) {
      error = caught;
    }
    const expenseId = await this.resolveDocumentOperation(
      'expense',
      submissionKey,
      data,
      error,
      staged,
      'Unable to save expense.',
    );
    await this.refresh();
    return expenseId;
  }

  async submitPayment(
    payment: Omit<Payment, 'id' | 'receiptNumber' | 'verificationStatus' | 'flatNumber'>,
    file: File | null,
    submissionKey: string,
  ): Promise<string> {
    this.assertValidDocuments(file ? [file] : []);
    if (!this.auth.supabase) {
      const existingId = this.demoOperationIds.get(`payment:${submissionKey}`);
      if (existingId) return existingId;
      const paymentId = await this.addPayment(payment);
      if (file) {
        await this.uploadDocument(file, 'payment', paymentId, 'payment_proof');
      }
      this.demoOperationIds.set(`payment:${submissionKey}`, paymentId);
      return paymentId;
    }

    const staged = await this.stageDocuments(file ? [file] : [], submissionKey);
    let data: string | null = null;
    let error: unknown;
    try {
      const result = await this.auth.supabase.rpc('submit_payment_with_document', {
        p_charge_id: payment.maintenanceChargeId,
        p_amount: payment.amount,
        p_payment_date: payment.paymentDate,
        p_payment_mode: payment.paymentMode,
        p_transaction_reference: payment.transactionReference || null,
        p_notes: payment.notes || null,
        p_submission_key: submissionKey,
        p_documents: staged,
      });
      data = result.data as string | null;
      error = result.error;
    } catch (caught) {
      error = caught;
    }
    const paymentId = await this.resolveDocumentOperation(
      'payment',
      submissionKey,
      data,
      error,
      staged,
      'Unable to save payment.',
    );
    await this.refresh();
    return paymentId;
  }

  async updateExpense(
    expenseId: string,
    expense: Omit<Expense, 'id' | 'status'>,
    replacementFiles: File[],
    editKey: string,
  ): Promise<void> {
    this.assertManager();
    this.assertValidDocuments(replacementFiles);
    if (!this.auth.supabase) {
      const existing = this.expenses().find((item) => item.id === expenseId);
      if (!existing) throw new Error('Expense not found.');
      this.expenses.update((items) =>
        items.map((item) =>
          item.id === expenseId
            ? {
                ...item,
                ...expense,
                category: expense.customCategory || expense.category,
                updatedAt: new Date().toISOString(),
                updatedBy: this.auth.profile()?.id,
              }
            : item,
        ),
      );
      if (replacementFiles.length) {
        this.documents.update((items) =>
          items.filter((item) => !(item.entityType === 'expense' && item.entityId === expenseId)),
        );
        for (const file of replacementFiles) {
          await this.uploadDocument(file, 'expense', expenseId, 'expense_bill');
        }
      }
      this.audit('expense.updated', 'expense', expenseId);
      return;
    }

    const staged = await this.stageDocuments(replacementFiles, editKey);
    let data: string | null = null;
    let error: unknown;
    try {
      const result = await this.auth.supabase.rpc('update_expense_with_document', {
        p_expense_id: expenseId,
        p_expense_date: expense.expenseDate,
        p_category_name: expense.baseCategory ?? expense.category,
        p_other_category: expense.customCategory || null,
        p_vendor_name: expense.vendorName,
        p_description: expense.description,
        p_amount: expense.amount,
        p_payment_mode: expense.paymentMode,
        p_transaction_reference: expense.transactionReference || null,
        p_notes: expense.notes || null,
        p_edit_key: editKey,
        p_documents: staged,
      });
      data = result.data as string | null;
      error = result.error;
    } catch (caught) {
      error = caught;
    }
    await this.resolveDocumentOperation(
      'expense',
      editKey,
      data,
      error,
      staged,
      'Unable to update expense.',
    );
    await this.refresh();
  }

  async deleteExpense(expenseId: string, reason: string): Promise<void> {
    this.assertEmergencyAdmin('Only the Emergency Administrator can delete expenses.');
    if (reason.trim().length < 3) throw new Error('A deletion reason is required.');
    if (this.auth.supabase) {
      const { error } = await this.auth.supabase.rpc('delete_expense', {
        p_expense_id: expenseId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      await this.refresh();
      return;
    }
    const existing = this.expenses().find((item) => item.id === expenseId);
    if (!existing) throw new Error('Expense not found.');
    this.expenses.update((items) => items.filter((item) => item.id !== expenseId));
    this.audit('expense.deleted', 'expense', expenseId, reason.trim());
  }

  async uploadDocument(
    file: File,
    entityType: 'payment' | 'expense',
    entityId: string,
    documentType: 'payment_proof' | 'expense_bill',
  ): Promise<void> {
    const validationError = this.documentValidationError(file);
    if (validationError) throw new Error(validationError);
    if (!this.auth.supabase) {
      this.documents.update((items) => [
        {
          id: crypto.randomUUID(),
          entityType,
          entityId,
          documentType,
          originalFilename: file.name,
          sizeBytes: file.size,
          createdAt: new Date().toISOString(),
        },
        ...items,
      ]);
      return;
    }
    const extension = file.name.split('.').pop()!.toLowerCase();
    const now = new Date();
    const storedFilename = `${crypto.randomUUID()}.${extension}`;
    const storagePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${entityType}/${entityId}/${storedFilename}`;
    const { data: document, error: metadataError } = await this.auth.supabase
      .from('documents')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        document_type: documentType,
        storage_path: storagePath,
        original_filename: file.name,
        stored_filename: storedFilename,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: this.auth.profile()?.id,
      })
      .select('id')
      .single();
    if (metadataError) throw metadataError;
    const { error: uploadError } = await this.auth.supabase.storage
      .from('financial-documents')
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      await this.auth.supabase.rpc('discard_failed_document', { p_document_id: document.id });
      throw uploadError;
    }
  }

  async approveExpense(expenseId: string, approve: boolean, reason?: string): Promise<void> {
    this.assertManager();
    if (!approve && (!reason || reason.trim().length < 3)) {
      throw new Error('A rejection reason is required.');
    }
    if (this.auth.supabase) {
      const { error } = await this.auth.supabase.rpc('review_expense', {
        p_expense_id: expenseId,
        p_approve: approve,
        p_reason: approve ? null : reason,
      });
      if (error) throw error;
      await this.refresh();
      return;
    }
    this.expenses.update((items) =>
      items.map((item) =>
        item.id === expenseId
          ? {
              ...item,
              status: approve ? 'approved' : 'rejected',
              rejectionReason: approve ? undefined : reason,
            }
          : item,
      ),
    );
    this.audit(approve ? 'expense.approved' : 'expense.rejected', 'expense', expenseId, reason);
  }

  async cancelPayment(paymentId: string, reason: string): Promise<void> {
    this.assertManager();
    if (reason.trim().length < 3) throw new Error('A cancellation reason is required.');
    if (this.auth.supabase) {
      const { error } = await this.auth.supabase.rpc('cancel_payment', {
        p_payment_id: paymentId,
        p_reason: reason,
      });
      if (error) throw error;
      await this.refresh();
      return;
    }
    const payment = this.payments().find((item) => item.id === paymentId);
    if (!payment) throw new Error('Payment not found.');
    this.payments.update((items) =>
      items.map((item) => (item.id === paymentId ? { ...item, cancelled: true } : item)),
    );
    this.recalculateCharge(payment.maintenanceChargeId);
    this.audit('payment.cancelled', 'payment', paymentId, reason);
  }

  async cancelExpense(expenseId: string, reason: string): Promise<void> {
    this.assertManager();
    if (reason.trim().length < 3) throw new Error('A cancellation reason is required.');
    if (this.auth.supabase) {
      const { error } = await this.auth.supabase.rpc('cancel_expense', {
        p_expense_id: expenseId,
        p_reason: reason,
      });
      if (error) throw error;
      await this.refresh();
      return;
    }
    this.expenses.update((items) =>
      items.map((item) =>
        item.id === expenseId ? { ...item, status: 'cancelled' as const } : item,
      ),
    );
    this.audit('expense.cancelled', 'expense', expenseId, reason);
  }

  async authorizedDocumentDownloads(): Promise<
    Array<{ filename: string; url: string; entityType: string; entityId: string }>
  > {
    if (!this.auth.supabase) {
      throw new Error('Signed document downloads require Supabase configuration.');
    }
    const { data: documents, error } = await this.auth.supabase
      .from('documents')
      .select('storage_path,original_filename,entity_type,entity_id')
      .is('deleted_at', null)
      .not('storage_path', 'is', null);
    if (error) throw error;
    const downloads = [];
    for (const document of documents ?? []) {
      const { data, error: signedError } = await this.auth.supabase.storage
        .from('financial-documents')
        .createSignedUrl(document.storage_path, 120);
      if (signedError) throw signedError;
      downloads.push({
        filename: document.original_filename,
        url: data.signedUrl,
        entityType: document.entity_type,
        entityId: document.entity_id,
      });
    }
    return downloads;
  }

  async signedDocumentUrl(documentId: string): Promise<string> {
    if (!this.auth.supabase) {
      throw new Error('Document preview requires Supabase configuration.');
    }
    const { data: document, error } = await this.auth.supabase
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .is('deleted_at', null)
      .single();
    if (error || !document?.storage_path) {
      throw new Error('The document is unavailable or you are not authorized to view it.');
    }
    const { data, error: signedError } = await this.auth.supabase.storage
      .from('financial-documents')
      .createSignedUrl(document.storage_path, 120);
    if (signedError || !data.signedUrl) {
      throw new Error('Unable to create a secure document link.');
    }
    return data.signedUrl;
  }

  async completeHandover(
    nextFlatId: string,
    notes: string,
    confirmedBalance: number,
  ): Promise<void> {
    this.assertManager();
    const current = this.responsibilities().find((item) => item.status === 'current');
    const nextFlat = this.flats().find((item) => item.id === nextFlatId);
    if (!current || !nextFlat) throw new Error('Select a valid next responsible flat.');
    if (Math.abs(confirmedBalance - this.summary().closingBalance) > 0.009) {
      throw new Error('The confirmed balance must match the calculated closing balance.');
    }
    if (this.auth.supabase) {
      const { data: nextOwner, error: ownerError } = await this.auth.supabase
        .from('profiles')
        .select('id')
        .eq('flat_id', nextFlatId)
        .eq('account_status', 'active')
        .single();
      if (ownerError) throw ownerError;
      const { error } = await this.auth.supabase.rpc('complete_annual_handover', {
        p_current_id: current.id,
        p_next_flat_id: nextFlatId,
        p_next_owner_profile_id: nextOwner.id,
        p_notes: notes,
        p_confirmed_closing_balance: confirmedBalance,
      });
      if (error) throw error;
      this.auth.relinquishCurrentResponsibility();
      await this.refresh();
      return;
    }
    this.responsibilities.update((items) => {
      const nextYear = current.responsibilityYear + 1;
      const existingUpcoming = items.find(
        (item) =>
          item.responsibilityYear === nextYear &&
          item.flatNumber === nextFlat.flatNumber &&
          item.status === 'upcoming',
      );
      const updated = items.map((item) => {
        if (item.id === current.id) {
          return { ...item, status: 'completed' as const, closingBalance: confirmedBalance };
        }
        if (item.id === existingUpcoming?.id) {
          return {
            ...item,
            status: 'current' as const,
            openingBalance: confirmedBalance,
          };
        }
        return item;
      });
      return existingUpcoming
        ? updated
        : [
            ...updated,
            {
              id: crypto.randomUUID(),
              responsibilityYear: nextYear,
              flatNumber: nextFlat.flatNumber,
              ownerName: nextFlat.ownerName,
              startDate: `${nextYear}-01-01`,
              endDate: `${nextYear}-12-31`,
              openingBalance: confirmedBalance,
              closingBalance: null,
              status: 'current' as const,
            },
          ];
    });
    this.audit('responsibility.handover', 'maintenance_responsibility', current.id, notes);
    this.auth.relinquishCurrentResponsibility();
  }

  async updateOwnerDetails(flatId: string, ownerName: string, mobile?: string): Promise<void> {
    this.assertEmergencyAdmin();
    const normalizedName = ownerName.trim();
    const normalizedMobile = mobile?.trim() || undefined;
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      throw new Error('Owner name must contain between 2 and 120 characters.');
    }
    if (normalizedMobile && !/^[0-9+() -]{7,20}$/.test(normalizedMobile)) {
      throw new Error('Enter a valid mobile number.');
    }
    if (this.auth.supabase) {
      const { error } = await this.auth.supabase.rpc('update_owner_details', {
        p_flat_id: flatId,
        p_owner_name: normalizedName,
        p_mobile: normalizedMobile ?? null,
      });
      if (error) throw error;
      await this.refresh();
      return;
    }
    const target = this.flats().find((flat) => flat.id === flatId);
    if (!target) throw new Error('Flat owner not found.');
    this.flats.update((items) =>
      items.map((flat) =>
        flat.id === flatId
          ? { ...flat, ownerName: normalizedName, mobile: normalizedMobile }
          : flat,
      ),
    );
    this.responsibilities.update((items) =>
      items.map((item) =>
        item.flatNumber === target.flatNumber ? { ...item, ownerName: normalizedName } : item,
      ),
    );
    this.audit('owner.updated', 'profile', flatId);
  }

  storageUsage(): number {
    return this.documents().reduce((total, item) => total + item.sizeBytes, 0);
  }

  private async stageDocuments(files: File[], operationKey: string): Promise<StagedDocument[]> {
    if (!this.auth.supabase || files.length === 0) return [];
    this.assertValidDocuments(files);
    const userId = this.auth.profile()?.id;
    if (!userId) throw new Error('Your session has expired. Sign in again.');

    const staged: StagedDocument[] = [];
    const attemptedPaths: string[] = [];
    try {
      for (const file of files) {
        const extension = file.name.split('.').pop()!.toLowerCase();
        const storedFilename = `${crypto.randomUUID()}.${extension}`;
        const storagePath = `staging/${userId}/${operationKey}/${storedFilename}`;
        attemptedPaths.push(storagePath);
        const { error } = await this.auth.supabase.storage
          .from('financial-documents')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });
        if (error) throw error;
        staged.push({
          storage_path: storagePath,
          original_filename: file.name,
          stored_filename: storedFilename,
          mime_type: file.type,
          size_bytes: file.size,
        });
      }
      return staged;
    } catch (error) {
      await this.cleanupStagedDocuments(attemptedPaths);
      throw new Error(this.errorMessage(error, 'Document upload failed. No record was created.'), {
        cause: error,
      });
    }
  }

  private async resolveDocumentOperation(
    entityType: 'payment' | 'expense',
    operationKey: string,
    data: string | null,
    error: unknown,
    staged: StagedDocument[],
    fallback: string,
  ): Promise<string> {
    if (!error && data) return data;
    if (!this.auth.supabase) throw new Error(fallback);

    let resolution;
    try {
      resolution = await this.auth.supabase.rpc('resolve_document_submission', {
        p_entity_type: entityType,
        p_operation_key: operationKey,
      });
    } catch (caught) {
      throw new Error(
        'The submission status could not be confirmed. Retry once; the operation key prevents duplicates.',
        { cause: caught },
      );
    }
    if (resolution.error) {
      throw new Error(
        'The submission status could not be confirmed. Retry once; the operation key prevents duplicates.',
      );
    }
    if (resolution.data) return resolution.data as string;
    await this.cleanupStagedDocuments(staged.map((item) => item.storage_path));
    throw new Error(this.errorMessage(error, fallback));
  }

  private async cleanupStagedDocuments(paths: string[]): Promise<void> {
    if (!this.auth.supabase || paths.length === 0) return;
    try {
      await this.auth.supabase.storage.from('financial-documents').remove(paths);
    } catch {
      // Cleanup is best-effort; the original upload/database error is more useful.
    }
  }

  private documentValidationError(file: File): string | null {
    return fileValidationError(file);
  }

  private assertValidDocuments(files: File[]): void {
    if (files.length > 5) throw new Error('Attach no more than five documents.');
    for (const file of files) {
      const error = this.documentValidationError(file);
      if (error) throw new Error(error);
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }
    return fallback;
  }

  private recalculateCharge(chargeId: string): void {
    const paid = this.payments()
      .filter(
        (item) =>
          item.maintenanceChargeId === chargeId &&
          item.verificationStatus === 'verified' &&
          !item.cancelled,
      )
      .reduce((total, item) => total + item.amount, 0);
    this.charges.update((items) =>
      items.map((charge) => {
        if (charge.id !== chargeId) return charge;
        const balance = Math.max(0, charge.totalAmount - paid);
        return {
          ...charge,
          paidAmount: paid,
          balanceAmount: balance,
          status: balance === 0 ? 'paid' : paid > 0 ? 'partially_paid' : charge.status,
        };
      }),
    );
  }

  private audit(action: string, entityType: string, entityId?: string, reason?: string): void {
    this.auditLogs.update((items) => [
      {
        id: crypto.randomUUID(),
        action,
        entityType,
        entityId,
        username: this.auth.profile()?.username ?? 'system',
        reason,
        createdAt: new Date().toISOString(),
      },
      ...items,
    ]);
  }

  private assertManager(): void {
    if (!this.auth.canManage())
      throw new Error('Only the Current Maintenance Administrator can perform this action.');
  }

  private assertEmergencyAdmin(
    message = 'Only the Emergency Administrator can edit owner details.',
  ): void {
    if (this.auth.profile()?.role !== 'emergency_admin') {
      throw new Error(message);
    }
  }
}
