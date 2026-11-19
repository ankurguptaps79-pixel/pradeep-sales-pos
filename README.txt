PRADEEP SALES POS - complete package (version 3)
================================================

FILES (keep all of them together in one folder)
  index.html, style.css, app.js     the application
  manifest.json, service-worker.js  make it installable and usable offline
  logo.png, logo-print.png          built-in company logo (colour / black & white for receipts)
  icon-192.png, icon-512.png, icon-maskable.png   app icons

INSTALL ON THE ANDROID TABLET
  1. Host this folder on any HTTPS address (for example drag the folder
     onto app.netlify.com/drop, or use GitHub Pages).
  2. Open the link in Google Chrome on the tablet (not Incognito).
  3. Chrome menu > Add to Home screen > Install.
  The app then opens full screen and works without internet.

58mm THERMAL PRINTER
  1. Install a thermal print-service app on the tablet (for example RawBT,
     or your printer brand's own app) and pair the printer.
  2. In the POS: Settings > Print Test Receipt, choose the printer,
     paper size 58mm.

CUSTOMER COPY / SALES COPY
  SAVE & PRINT asks which copy to print: Customer Copy, Sales Copy or Both.
  Sales Copy has a customer signature line. To stop the question, choose a
  fixed option in Settings > Copies to print on Save & Print.

LOYALTY POINTS (off until you enable it)
  Settings > Loyalty Points > Enable loyalty mode.
  - Item: set "points per unit" on each product (Products > Edit).
  - Transaction: X points for every Rs Y of bill value.
  - Party: each customer can be enrolled or not, and can have a points
    multiplier (Customers > Edit). Customers > Points shows the ledger and
    allows manual add / deduct.
  Points need a 10-digit mobile number on the bill. Every earn and redeem is
  linked to the invoice and the party. Deleting an invoice reverses its points.

SEND INVOICE BY MESSAGE
  Enter the customer's mobile number on the bill. After saving, a box offers
  WhatsApp and SMS with the invoice already typed; press Send.
  Old invoices: Sales History > open invoice > WhatsApp / SMS.

IMPORT PRODUCTS IN BULK
  Products > Import CSV. Columns: Item Name, Brand, Selling Price, Points (optional).

BACKUP
  All data is stored only on the tablet, inside Chrome. Use
  Settings > Download JSON Backup regularly and keep the file elsewhere.
  Clearing Chrome's site data or uninstalling Chrome erases the data.

UPDATING FROM AN OLDER VERSION
  Upload ALL files of this folder to the same hosting (replace the old ones).
  Close and reopen the app twice on the tablet. Saved data is kept.
