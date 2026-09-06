import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Expense, MaintenanceCharge, Payment } from './models';
import { amountInIndianWords, formatApartmentDate, formatInr } from './financial.utils';

export function safeSpreadsheetValue(value: unknown): string | number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '');
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly auth = inject(AuthService);

  async downloadReceipt(payment: Payment, charge?: MaintenanceCharge): Promise<void> {
    if (payment.verificationStatus !== 'verified' || !payment.receiptNumber) {
      throw new Error('An official receipt is available only after verification.');
    }
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFillColor(15, 118, 110);
    doc.rect(0, 0, 210, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('MUKUNDA ENCLAVE', 16, 18);
    doc.setFontSize(10);
    doc.text('Official maintenance receipt', 16, 27);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    const rows: [string, string][] = [
      ['Receipt number', payment.receiptNumber],
      ['Payment date', formatApartmentDate(payment.paymentDate)],
      ['Flat number', payment.flatNumber],
      ['Maintenance month', charge?.billingMonth ?? '—'],
      ['Amount paid', formatInr(payment.amount)],
      ['Amount in words', amountInIndianWords(payment.amount)],
      ['Payment mode', payment.paymentMode.replaceAll('_', ' ')],
      ['Transaction reference', payment.transactionReference || '—'],
      ['Remaining balance', formatInr(charge?.balanceAmount ?? 0)],
      [
        'Generated date',
        new Intl.DateTimeFormat('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Kolkata',
        }).format(new Date()),
      ],
    ];
    let y = 48;
    for (const [label, value] of rows) {
      doc.setTextColor(100, 116, 139);
      doc.text(label, 16, y);
      doc.setTextColor(15, 23, 42);
      doc.text(value, 78, y);
      doc.setDrawColor(226, 232, 240);
      doc.line(16, y + 4, 194, y + 4);
      y += 13;
    }
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('This is a computer-generated receipt.', 105, 280, { align: 'center' });
    doc.save(`${payment.receiptNumber}.pdf`);
  }

  async downloadCsv(
    filename: string,
    rows: Array<Record<string, string | number | null | undefined>>,
  ): Promise<void> {
    if (!rows.length) throw new Error('There are no rows to export.');
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) =>
      `"${String(safeSpreadsheetValue(value)).replaceAll('"', '""')}"`;
    const csv = [
      headers.map(escape).join(','),
      ...rows.map((row) => headers.map((key) => escape(row[key])).join(',')),
    ].join('\r\n');
    this.saveBlob(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
  }

  async downloadXlsx(filename: string, sheetName: string, rows: unknown[]): Promise<void> {
    if (!rows.length) throw new Error('There are no rows to export.');
    const writeXlsxFile = (await import('write-excel-file/browser')).default;
    const records = rows as Array<Record<string, unknown>>;
    const headers = Object.keys(records[0]);
    const data = [
      headers.map((header) => ({ value: header, fontWeight: 'bold' as const })),
      ...records.map((row) => headers.map((header) => safeSpreadsheetValue(row[header]))),
    ];
    const columns = headers.map((header) => ({
      width: Math.min(
        40,
        Math.max(12, header.length, ...records.map((row) => String(row[header] ?? '').length)),
      ),
    }));
    const blob = await writeXlsxFile(data, {
      sheet: sheetName.slice(0, 31),
      columns,
    }).toBlob();
    this.saveBlob(blob, `${filename}.xlsx`);
  }

  async downloadReportPdf(
    title: string,
    period: string,
    rows: Array<Record<string, string | number>>,
    total: number,
  ): Promise<void> {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(18);
    doc.text('Mukunda Enclave', 14, 16);
    doc.setFontSize(12);
    doc.text(title, 14, 24);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Period: ${period}  ·  Generated: ${new Date().toLocaleString('en-IN')}  ·  By: ${this.auth.profile()?.username ?? 'system'}`,
      14,
      31,
    );
    const headers = rows.length ? Object.keys(rows[0]) : ['Result'];
    autoTableModule.default(doc, {
      startY: 38,
      head: [headers],
      body: rows.map((row) => headers.map((header) => String(row[header] ?? ''))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 118, 110] },
      didDrawPage: ({ pageNumber }) => {
        doc.text(`Page ${pageNumber}`, 278, 200);
      },
    });
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(`Overall total: ${formatInr(total)}`, 278, Math.min(finalY + 10, 190), {
      align: 'right',
    });
    doc.save(`${this.slug(title)}.pdf`);
  }

  async downloadDocumentZip(
    files: Array<{ filename: string; url: string; entityType: string; entityId: string }>,
  ): Promise<void> {
    if (!files.length) throw new Error('There are no authorized documents to download.');
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const manifest: Array<Record<string, string>> = [];
    for (const file of files) {
      const response = await fetch(file.url);
      if (!response.ok) throw new Error(`Could not download ${file.filename}.`);
      zip.file(file.filename, await response.blob());
      manifest.push({
        filename: file.filename,
        entityType: file.entityType,
        entityId: file.entityId,
      });
    }
    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          generatedBy: this.auth.profile()?.username,
          files: manifest,
        },
        null,
        2,
      ),
    );
    this.saveBlob(
      await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
      'mukunda-enclave-documents.zip',
    );
  }

  paymentRows(payments: Payment[]): Record<string, string | number>[] {
    return payments.map((item) => ({
      'Receipt number': item.receiptNumber ?? '',
      'Payment date': formatApartmentDate(item.paymentDate),
      Flat: item.flatNumber,
      Amount: item.amount,
      Mode: item.paymentMode,
      Reference: item.transactionReference,
      Status: item.verificationStatus,
    }));
  }

  expenseRows(expenses: Expense[]): Record<string, string | number>[] {
    return expenses.map((item) => ({
      Date: formatApartmentDate(item.expenseDate),
      Category: item.category,
      Vendor: item.vendorName,
      Description: item.description,
      Amount: item.amount,
      Mode: item.paymentMode,
      Status: item.status,
    }));
  }

  private saveBlob(blob: Blob, filename: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  private slug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
