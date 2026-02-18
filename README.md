# KDP Publisher Command Center

A production-ready static web app for self-published authors to track KDP portfolio performance, identify winning books/niches, and take action based on performance signals.

## Tech Stack

- HTML
- CSS
- Vanilla JavaScript (ES modules)
- Chart.js
- LocalStorage (no backend)

## Project Structure

```text
kdp-command-center/
  index.html
  styles.css
  app.js
  storage.js
  csvImport.js
  charts.js
  README.md
```

## Open Locally

1. Download or clone the project folder.
2. Open `index.html` in a browser.
3. Optional: run a local static server for module support consistency:
   - Python: `python3 -m http.server 8080`
   - Then visit `http://localhost:8080`

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repository.
2. In Cloudflare Dashboard, go to Pages -> Create a project.
3. Connect your GitHub repository.
4. Use these settings:
   - Framework preset: `None`
   - Build command: (leave blank)
   - Build output directory: `/`
5. Deploy.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In repository settings, open `Pages`.
3. Set source to deploy from branch (e.g., `main`) and root folder (`/`).
4. Save and wait for deployment.

## How to Import KDP CSV / Excel

1. Click `Import KDP Report` area or drag/drop a `.csv`, `.xlsx`, or `.xls` file.
2. Supported exports:
   - KDP royalty reports
   - KDP orders reports
3. Required columns (flexible naming accepted):
   - Title
   - Royalty/Amount/Earnings
   - Date/Month
4. Optional:
   - Units sold / Quantity
5. If unknown titles are found, the app prompts you to:
   - Create new books automatically, or
   - Map each title to an existing book.
6. Duplicate imports are prevented using file-hash detection.
7. The workbook format `KDP_Royalties_Estimator-*.xlsx` is supported directly (reads tabs with `Royalty Date`, `Title`, `Net Units Sold`, and `Royalty`).

## Backup and Restore

### Export backup

- Click `Export Backup`.
- A `.json` file downloads with books, sales, imports, and settings.

### Import backup

- Click `Import Backup` and select a previously exported backup JSON file.
- Existing local data is replaced by the imported backup.

## Data Storage

All data is stored in your browser LocalStorage only.

- No login
- No external APIs
- No cloud sync

Export backups regularly to avoid local browser data loss.

## Error Handling Included

- Invalid CSV structure
- Empty CSV files
- Duplicate import attempts
- Missing/unmatched titles
- Invalid backup files

## Product Features Included

- Book portfolio manager (add/edit/delete)
- Monthly/lifetime revenue analytics
- Profit and ROI tracking
- Break-even status per book
- Revenue trend and portfolio charts
- Rules-engine insights (`What To Do Next`)
- Mobile responsive dashboard UI
