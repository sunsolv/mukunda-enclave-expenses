import { describe, expect, it } from 'vitest';
import { safeSpreadsheetValue } from './export.service';

describe('safeSpreadsheetValue', () => {
  it('neutralizes spreadsheet formulas, including whitespace-prefixed payloads', () => {
    expect(safeSpreadsheetValue('=HYPERLINK("https://example.invalid")')).toBe(
      `'=HYPERLINK("https://example.invalid")`,
    );
    expect(safeSpreadsheetValue('  @SUM(1,2)')).toBe("'  @SUM(1,2)");
    expect(safeSpreadsheetValue('-2+3')).toBe("'-2+3");
  });

  it('preserves ordinary text and numeric values', () => {
    expect(safeSpreadsheetValue('Naik - Garbage')).toBe('Naik - Garbage');
    expect(safeSpreadsheetValue(2511)).toBe(2511);
  });
});
