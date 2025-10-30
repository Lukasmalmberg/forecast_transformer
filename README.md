# Storytel Forecast Transformer

A web application that transforms forecast data into Atlar-compatible CSV format. Upload your forecast data in CSV or XLSX format and get back a properly formatted CSV file ready for import into Atlar.

## Features

- **Drag & Drop File Upload**: Support for CSV and XLSX files
- **Flexible Date Formats**: Handles YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, and Excel serial numbers
- **Category Processing**: Option to use full category paths or just the leaf names
- **Comma Decimal Support**: Handles European number formats (100,50)
- **Real-time Validation**: Immediate feedback on file structure and data quality
- **Excel-Compatible Output**: UTF-8 with BOM for proper Excel import

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to `http://localhost:3000`

## Input File Format

Your input file must have the following structure:

### Header Row
- Must contain a "Category" column (case-insensitive)
- All columns to the right of Category must be date headers
- Supported date formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, Excel serial numbers

### Data Rows
- Category column: hierarchical paths like "Marketing>Ads" or "Ops>Office"
- Date columns: numeric amounts (supports comma as decimal separator)
- Empty cells are ignored

### Example Input
```csv
Category,2025-01-01,2025-01-02,2025-01-03
Marketing>Ads,1200,800,
Ops>Office,150,,
R&D>Hosting,,"100,50",200
```

## Output Format

The application generates a CSV with these columns:
- `amount.currency` - Currency from form input (default: SEK)
- `amount.stringValue` - Amount with 2 decimal places
- `date` - ISO date format (YYYY-MM-DD)
- `parent.id` - Parent ID from form input (default: ENTITY_ID)
- `parent.type` - Always "ENTITY"
- `description` - Category name (leaf or full path)
- `metadata.atlar.category` - Same as description for traceability

## Configuration Options

- **Currency**: Set the currency code (default: SEK)
- **Parent ID**: Set the parent entity ID (default: ENTITY_ID)
- **Use Category Leaf**: Toggle between full category paths or just leaf names

## Technology Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety and better developer experience
- **Tailwind CSS** - Utility-first CSS framework
- **XLSX** - Excel file parsing
- **Papa Parse** - CSV parsing
- **Lucide React** - Beautiful icons

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## Error Handling

The application provides comprehensive error handling for:
- Invalid file formats
- Missing Category column
- Invalid date formats
- Non-numeric amounts
- Empty data files
- File size limits

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## License

This project is proprietary software for Storytel.
