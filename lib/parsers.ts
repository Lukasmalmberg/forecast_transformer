import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ParsedData {
  headers: string[];
  data: string[][];
  categoryIndex: number;
  dateIndices: number[];
  // Maps column index to array of expanded dates (for week-range headers)
  expandedDates: Map<number, string[]>;
}

export interface ParsedDataMulti {
  headers: string[];
  data: string[][];
  entityIdIndex: number;
  currencyIndex: number;
  categoryIndex: number;
  dateIndices: number[];
}

export interface TransformOptions {
  currency: string;
  parentId: string;
  periodicity?: string; // Optional periodicity field
}

// Format YYYY-MM-DD without timezone side effects
function formatIsoDate(year: number, monthZeroBased: number, day: number): string {
  const yyyy = String(year);
  const mm = String(monthZeroBased + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Excel serial to ISO using UTC math (origin 1899-12-30)
function excelSerialToIso(serial: number): string {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const originUtcMs = Date.UTC(1899, 11, 30);
  const dateUtcMs = originUtcMs + serial * MS_PER_DAY;
  const d = new Date(dateUtcMs);
  return formatIsoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
export interface TransformedRow {
  'amount.currency': string;
  'amount.stringValue': string;
  'date': string;
  'parent.id': string;
  'parent.type': string;
  'description': string;
  'metadata.atlar.category': string;
}

export function parseFile(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Failed to read file'));
          return;
        }

        let parsedData: ParsedData;

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          parsedData = parseExcel(data as ArrayBuffer);
        } else if (file.name.endsWith('.csv')) {
          parsedData = parseCSV(data as string);
        } else {
          reject(new Error('Unsupported file format. Please use CSV or XLSX files.'));
          return;
        }

        resolve(parsedData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'utf-8');
    }
  });
}

export function parseFileMulti(file: File): Promise<ParsedDataMulti> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Failed to read file'));
          return;
        }
        let parsed: ParsedDataMulti;
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          parsed = parseExcelAsMulti(data as ArrayBuffer);
        } else if (file.name.endsWith('.csv')) {
          parsed = parseCSVMulti(data as string);
        } else {
          reject(new Error('Unsupported file format. Please use CSV or XLSX files.'));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'utf-8');
    }
  });
}

function parseExcel(data: ArrayBuffer): ParsedData {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Use XLSX's built-in conversion but with raw values
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, 
    defval: '',
    raw: true // This gets the raw Excel values instead of formatted strings
  }) as any[][];
  
  return parseArrayData(jsonData);
}

function parseExcelAsMulti(data: ArrayBuffer): ParsedDataMulti {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true
  }) as any[][];
  return parseArrayDataMulti(jsonData);
}

function parseCSV(data: string): ParsedData {
  // Check if it's tab-separated by looking for tabs
  const isTabSeparated = data.includes('\t') && !data.includes(',');
  console.log('[parseCSV] Tab-separated:', isTabSeparated);
  console.log('[parseCSV] First 200 chars:', data.substring(0, 200));
  
  const result = Papa.parse(data, {
    header: false,
    skipEmptyLines: true,
    delimiter: isTabSeparated ? '\t' : ','
  });
  
  console.log('[parseCSV] Parsed rows:', result.data.length);
  console.log('[parseCSV] First row:', result.data[0]);
  
  return parseArrayData(result.data as string[][]);
}

function parseCSVMulti(data: string): ParsedDataMulti {
  const isTabSeparated = data.includes('\t') && !data.includes(',');
  const result = Papa.parse(data, {
    header: false,
    skipEmptyLines: true,
    delimiter: isTabSeparated ? '\t' : ','
  });
  return parseArrayDataMulti(result.data as string[][]);
}

function parseArrayData(data: any[][]): ParsedData {
  if (data.length === 0) {
    throw new Error('File is empty');
  }

  // Convert headers, handling Excel date serial numbers
  console.log('[parseArrayData] Raw first row:', data[0]);
  const headers = data[0].map(h => {
    if (h && typeof h === 'number') {
      const iso = excelSerialToIso(h);
      const yr = parseInt(iso.slice(0, 4), 10);
      if (yr >= 1900 && yr <= 2100) return iso;
    }
    return h?.toString() || '';
  });
  console.log('[parseArrayData] Converted headers:', headers);
  
  const categoryIndex = findCategoryIndex(headers);
  console.log('[parseArrayData] Category index:', categoryIndex);
  
  if (categoryIndex === -1) {
    throw new Error('No "Category" column found. Please ensure your file has a "Category" header.');
  }

  const { indices: dateIndices, expandedDates } = findDateIndices(headers, categoryIndex);
  
  if (dateIndices.length === 0) {
    // Show what headers we actually found for debugging
    const headersAfterCategory = headers.slice(categoryIndex + 1, categoryIndex + 10); // Show first 9
    const allHeadersAfterCategory = headersAfterCategory.map((h, idx) => `[${categoryIndex + 1 + idx}]="${h}"`).join(', ');
    console.error('[ERROR] No date columns found. All headers:', headers);
    console.error('[ERROR] Headers after Category:', allHeadersAfterCategory);
    throw new Error(`No valid date columns found to the right of Category column. Headers found: ${allHeadersAfterCategory || 'NONE'}`);
  }

  // Filter out empty rows
  const nonEmptyRows = data.slice(1).filter(row => 
    row.some(cell => cell && cell.toString().trim() !== '')
  );

  if (nonEmptyRows.length === 0) {
    throw new Error('No data rows found. Please ensure your file has data below the header row.');
  }

  return {
    headers,
    data: nonEmptyRows.map(row => row.map(cell => cell?.toString() || '')),
    categoryIndex,
    dateIndices,
    expandedDates
  };
}

function parseArrayDataMulti(data: any[][]): ParsedDataMulti {
  if (data.length === 0) throw new Error('File is empty');
  const headers = data[0].map(h => {
    if (h && typeof h === 'number') {
      const iso = excelSerialToIso(h);
      const yr = parseInt(iso.slice(0, 4), 10);
      if (yr >= 1900 && yr <= 2100) return iso;
    }
    return h?.toString() || '';
  });
  const lower = headers.map(h => h.toLowerCase().trim());
  const entityIdIndex = lower.findIndex(h => h === 'entity id' || h === 'entity_id' || h === 'parent.id');
  const currencyIndex = lower.findIndex(h => h === 'currency' || h === 'amount.currency');
  const categoryIndex = lower.findIndex(h => h === 'category');
  if (entityIdIndex === -1) throw new Error('No "Entity ID" column found.');
  if (currencyIndex === -1) throw new Error('No "Currency" column found.');
  if (categoryIndex === -1) throw new Error('No "Category" column found.');
  const { indices: dateIndices } = findDateIndices(headers, categoryIndex);
  if (dateIndices.length === 0) throw new Error('No valid date columns found to the right of Category column.');
  const nonEmptyRows = data.slice(1).filter(row => row.some(cell => cell && cell.toString().trim() !== ''));
  if (nonEmptyRows.length === 0) throw new Error('No data rows found.');
  return {
    headers,
    data: nonEmptyRows.map(row => row.map(cell => cell?.toString() || '')),
    entityIdIndex,
    currencyIndex,
    categoryIndex,
    dateIndices
  };
}

function findCategoryIndex(headers: string[]): number {
  return headers.findIndex(header => 
    header && typeof header === 'string' && header.toLowerCase().trim() === 'category'
  );
}

function findDateIndices(headers: string[], categoryIndex: number): { indices: number[], expandedDates: Map<number, string[]> } {
  const dateIndices: number[] = [];
  const expandedDates = new Map<number, string[]>();
  
  // Check headers starting from after Category column
  for (let i = categoryIndex + 1; i < headers.length; i++) {
    const header = headers[i];
    
    // Skip empty headers but continue checking
    if (!header) {
      continue;
    }
    
    // Convert to string if it's not already
    const headerStr = typeof header === 'string' ? header : String(header);
    
    // Normalize header: trim, collapse whitespace, normalize unicode dashes to '-'
    const normalizedHeader = headerStr.trim().replace(/\s+/g, ' ').replace(/[–—]/g, '-');
    
    // Skip if empty after normalization
    if (!normalizedHeader) {
      continue;
    }
    
    // Debug: log what we're checking
    console.log(`[findDateIndices] Checking header at index ${i}: "${normalizedHeader}"`);
    
    const isValid = isValidDateHeader(normalizedHeader);
    console.log(`[findDateIndices] isValidDateHeader("${normalizedHeader}") = ${isValid}`);
    
    if (isValid) {
      dateIndices.push(i);
      
      // Check if it's a week range and expand it
      const weekRange = parseWeekRange(normalizedHeader);
      if (weekRange) {
        console.log(`[findDateIndices] Week range detected, expanded to ${weekRange.length} dates`);
        expandedDates.set(i, weekRange);
      }
    } else {
      // Stop at first non-empty, non-date header
      // (allow empty cells between date columns)
      console.log(`[findDateIndices] Stopping at non-date header: "${normalizedHeader}"`);
      break;
    }
  }
  
  console.log(`[findDateIndices] Returning ${dateIndices.length} date indices:`, dateIndices);
  return { indices: dateIndices, expandedDates };
}

// Parse week range (e.g., "Oct 27 - Nov 2" or "Nov 3-9") and expand to individual dates
function parseWeekRange(rangeStr: string): string[] | null {
  // Normalize: trim, collapse whitespace, and normalize dashes to '-'
  const trimmed = rangeStr
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-');
  
  // Pattern: "Mon DD - Mon DD" (cross-month or same month with explicit month name)
  const rangePattern1 = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|jan|feb|mar|apr|may|jun|jul|aug|sep|okt|nov|dec)\s+(\d{1,2})\s*[-–—]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|jan|feb|mar|apr|may|jun|jul|aug|sep|okt|nov|dec)\s+(\d{1,2})$/i;
  // Pattern: "Mon DD-DD" (same month)
  const rangePattern2 = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|jan|feb|mar|apr|may|jun|jul|aug|sep|okt|nov|dec)\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})$/i;
  
  const monthMap: { [key: string]: number } = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'okt': 9, 'nov': 10, 'dec': 11
  };
  
  let startMonth: number, startDay: number, endMonth: number, endDay: number;
  const year = 2025;
  
  const match1 = trimmed.match(rangePattern1);
  const match2 = trimmed.match(rangePattern2);
  
  if (match1) {
    // Full range: "Oct 27 - Nov 2"
    console.log(`[parseWeekRange] Matched pattern1: ${match1[0]}`);
    startMonth = monthMap[match1[1].toLowerCase()];
    startDay = parseInt(match1[2], 10);
    endMonth = monthMap[match1[3].toLowerCase()];
    endDay = parseInt(match1[4], 10);
    console.log(`[parseWeekRange] Extracted: month1=${startMonth}, day1=${startDay}, month2=${endMonth}, day2=${endDay}`);
  } else if (match2) {
    // Same month: "Nov 3-9"
    console.log(`[parseWeekRange] Matched pattern2: ${match2[0]}`);
    startMonth = monthMap[match2[1].toLowerCase()];
    startDay = parseInt(match2[2], 10);
    endMonth = startMonth;
    endDay = parseInt(match2[3], 10);
    console.log(`[parseWeekRange] Extracted: month=${startMonth}, day1=${startDay}, day2=${endDay}`);
  } else {
    console.log(`[parseWeekRange] No pattern match - returning null`);
    return null;
  }
  
  if (startMonth === undefined || endMonth === undefined) {
    console.log(`[parseWeekRange] Invalid month (start=${startMonth}, end=${endMonth}) - returning null`);
    return null;
  }
  
  // Generate all dates in range
  const dates: string[] = [];
  const start = new Date(year, startMonth, startDay);
  const end = new Date(year, endMonth, endDay);
  
  console.log(`[parseWeekRange] Date range: ${start.toISOString()} to ${end.toISOString()}`);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(formatIsoDate(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  
  console.log(`[parseWeekRange] Generated ${dates.length} dates`);
  return dates.length > 0 ? dates : null;
}

function isValidDateHeader(header: string): boolean {
  if (!header) return false;
  
  // Normalize: trim and replace multiple whitespace with single space
  const normalized = header.trim().replace(/\s+/g, ' ').replace(/[–—]/g, '-');
  
  // Try week-range parse directly
  const weekRange = parseWeekRange(normalized);
  if (weekRange) return true;
  
  // Check various date formats
  const dateFormats = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d+$/, // Excel serial number
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|jan|feb|mar|apr|may|jun|jul|aug|sep|okt|nov|dec)\s+\d{1,2}$/i, // Mon XX format (e.g., "Oct 29", "okt 29")
  ];
  
  return dateFormats.some(format => format.test(normalized));
}

export function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const trimmed = dateStr.trim();
  
  // YYYY-MM-DD format (already in correct format)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // DD/MM/YYYY or MM/DD/YYYY format (allow single-digit day/month)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const a = parts[0];
    const b = parts[1];
    const year = parts[2];
    
    // Prefer MM/DD first (common in exports), then fallback to DD/MM
    const mmdd = new Date(`${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`);
    const ddmm = new Date(`${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`);
    
    if (!isNaN(mmdd.getTime()) && mmdd.getFullYear() == parseInt(year)) {
      return mmdd.toISOString().split('T')[0];
    }
    if (!isNaN(ddmm.getTime()) && ddmm.getFullYear() == parseInt(year)) {
      return ddmm.toISOString().split('T')[0];
    }
  }
  
  // Month name + day format (e.g., "Oct 30", "Nov 1")
  const monthNameMatch = trimmed.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|jan|feb|mar|apr|may|jun|jul|aug|sep|okt|nov|dec)\s+(\d{1,2})$/i);
  if (monthNameMatch) {
    const monthName = monthNameMatch[1];
    const day = monthNameMatch[2];
    
    // Use 2025 as the year for all dates
    const year = 2025;
    
    // Map month names to numbers (including non-English)
    const monthMap: { [key: string]: number } = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'okt': 9, 'nov': 10, 'dec': 11
    };
    
    const monthNum = monthMap[monthName.toLowerCase()];
    if (monthNum !== undefined) {
      // Build ISO directly to avoid timezone shifts
      return formatIsoDate(year, monthNum, parseInt(day, 10));
    }
  }
  
  // Excel serial number
  if (/^\d+$/.test(trimmed)) {
    const serialNumber = parseInt(trimmed);
    if (serialNumber > 0) {
      return excelSerialToIso(serialNumber);
    }
  }
  
  return null;
}

export function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;
  
  const trimmed = amountStr.toString().trim();
  if (trimmed === '') return null;
  
  // Replace comma with dot for decimal separator
  const normalized = trimmed.replace(',', '.');
  const parsed = parseFloat(normalized);
  
  return isNaN(parsed) ? null : parsed;
}

export function getCategoryLeaf(category: string): string {
  const parts = category.split('>');
  return parts[parts.length - 1].trim();
}

export function transformData(parsedData: ParsedData, options: TransformOptions): TransformedRow[] {
  const result: TransformedRow[] = [];
  
  for (const row of parsedData.data) {
    const category = row[parsedData.categoryIndex]?.trim();
    if (!category) continue;
    
    // Always use category leaf (last part after >)
    const description = getCategoryLeaf(category);
    
    for (const dateIndex of parsedData.dateIndices) {
      const amountStr = row[dateIndex];
      const parsedAmount = parseAmount(amountStr);
      if (parsedAmount === null) continue;

      // If this column came from a week range, only output one row using the first day
      const expandedDatesForColumn = parsedData.expandedDates.get(dateIndex);
      if (expandedDatesForColumn && expandedDatesForColumn.length > 0) {
        const lastDate = expandedDatesForColumn[expandedDatesForColumn.length - 1];
        result.push({
          'amount.currency': options.currency,
          'amount.stringValue': parsedAmount.toFixed(2),
          'date': lastDate,
          'parent.id': options.parentId,
          'parent.type': 'ENTITY',
          'description': description,
          'metadata.atlar.category': description
        });
        continue;
      }

      // Single-date column
      const dateHeader = parsedData.headers[dateIndex];
      const parsedDate = parseDate(dateHeader);
      if (parsedDate) {
        result.push({
          'amount.currency': options.currency,
          'amount.stringValue': parsedAmount.toFixed(2),
          'date': parsedDate,
          'parent.id': options.parentId,
          'parent.type': 'ENTITY',
          'description': description,
          'metadata.atlar.category': description
        });
      }
    }
  }
  
  return result;
}

export function transformDataMulti(parsed: ParsedDataMulti): TransformedRow[] {
  const result: TransformedRow[] = [];
  for (const row of parsed.data) {
    const category = row[parsed.categoryIndex]?.trim();
    if (!category) continue;
    const description = getCategoryLeaf(category);
    const currency = row[parsed.currencyIndex]?.toUpperCase()?.trim();
    const parentId = row[parsed.entityIdIndex]?.trim();
    if (!currency || !parentId) continue;
    for (const dateIndex of parsed.dateIndices) {
      const dateHeader = parsed.headers[dateIndex];
      const amountStr = row[dateIndex];
      const parsedDate = parseDate(dateHeader);
      const parsedAmount = parseAmount(amountStr);
      if (parsedDate && parsedAmount !== null) {
        result.push({
          'amount.currency': currency,
          'amount.stringValue': parsedAmount.toFixed(2),
          'date': parsedDate,
          'parent.id': parentId,
          'parent.type': 'ENTITY',
          'description': description,
          'metadata.atlar.category': description
        });
      }
    }
  }
  return result;
}

export function generateCSV(data: TransformedRow[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  
  const csvContent = [
    headers.join(','),
    ...data.map(row => {
      const normalizedDate = parseDate(String(row['date'])) || String(row['date']);
      const values = [
        row['amount.currency'],
        row['amount.stringValue'],
        normalizedDate,
        row['parent.id'],
        row['parent.type'],
        row['description'],
        row['metadata.atlar.category']
      ];
      return values.join(',');
    })
  ].join('\n');
  
  // Return plain UTF-8 without BOM to avoid breaking first header
  return csvContent;
}

export function generateExcel(data: TransformedRow[]): ArrayBuffer {
  if (data.length === 0) return new ArrayBuffer(0);
  
  const headers = Object.keys(data[0]);
  
  // Create worksheet data
  const worksheetData = [
    headers,
    ...data.map(row => [
      row['amount.currency'],
      row['amount.stringValue'],
      row['date'],
      row['parent.id'],
      row['parent.type'],
      row['description'],
      row['metadata.atlar.category']
    ])
  ];
  
  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Forecast Data');
  
  // Generate Excel file as ArrayBuffer (SheetJS returns ArrayBuffer for type:'array')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}