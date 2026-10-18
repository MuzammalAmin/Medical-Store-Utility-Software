import { formatExpiry } from './domain/dates';
import { formatPercent } from './domain/gst';
import { formatRupees } from './domain/money';
import { PAYMENT_LABELS, type ReturnDetail, type SaleDetail } from './ipc/schemas/sales';
import type { ShopSettings } from './settings';

/**
 * 80mm thermal receipt (PRD §3.5, §5.6) as a self-contained HTML page:
 * 72mm printable width, monospace, black on white. Used both for printing and
 * for the on-screen preview, so they always match.
 */
const esc = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const money = (paisa: number) => formatRupees(paisa).replace('Rs ', '');

const dateTime = (ms: number) =>
  new Intl.DateTimeFormat('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);

const STYLE = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 3mm 4mm; width: 80mm; font: 11px/1.35 "Cascadia Mono", Consolas, monospace; color: #000; background: #fff; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
  .shop { font-size: 15px; font-weight: 700; }
  .total { font-size: 16px; font-weight: 700; }
  hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 0; vertical-align: top; }
  .item td { padding-top: 3px; }
  .muted { font-size: 10px; }
  .fbr { height: 0; }
`;

function header(shop: ShopSettings): string {
  return `
    <div class="c shop">${esc(shop.name)}</div>
    ${shop.address ? `<div class="c">${esc(shop.address)}</div>` : ''}
    ${shop.phone ? `<div class="c">Ph: ${esc(shop.phone)}</div>` : ''}
    ${shop.licenceNo ? `<div class="c muted">Licence: ${esc(shop.licenceNo)}</div>` : ''}
    ${shop.ntn ? `<div class="c muted">NTN: ${esc(shop.ntn)}${shop.strn ? ` · STRN: ${esc(shop.strn)}` : ''}</div>` : ''}
    <hr>`;
}

function row(left: string, right: string, cls = ''): string {
  return `<tr class="${cls}"><td>${left}</td><td class="r">${right}</td></tr>`;
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${STYLE}</style></head><body>${body}</body></html>`;
}

export function saleReceiptHtml(shop: ShopSettings, sale: SaleDetail, copy = false): string {
  const items = sale.lines
    .map(
      (l) => `
      <tr class="item"><td colspan="2" class="b">${esc(l.itemName)}</td></tr>
      <tr><td class="muted" colspan="2">Batch ${esc(l.batchNo)} · Exp ${formatExpiry(l.expiry)}${
        l.gstRateBp ? ` · GST ${formatPercent(l.gstRateBp)}` : ''
      }</td></tr>
      ${row(`${l.qty} ${l.unit} × ${money(l.unitFinalPaisa)}${l.discountPaisa ? ` (−${money(l.discountPaisa)})` : ''}`, money(l.totalPaisa))}`,
    )
    .join('');

  const body = `
    ${header(shop)}
    <table>
      ${row(`<span class="b">Invoice #${String(sale.invoiceNo).padStart(6, '0')}</span>`, copy ? 'COPY' : '')}
      ${row(dateTime(sale.at), esc(sale.cashierName))}
      ${sale.customerName ? row(`Customer: ${esc(sale.customerName)}`, esc(sale.customerPhone)) : ''}
      ${sale.doctorName ? row(`Doctor: ${esc(sale.doctorName)}`, '') : ''}
    </table>
    ${sale.status === 'void' ? '<div class="c b">*** VOID ***</div>' : ''}
    <hr><table>${items}</table><hr>
    <table>
      ${row('Subtotal', money(sale.subtotalPaisa))}
      ${sale.discountPaisa ? row('Discount', `−${money(sale.discountPaisa)}`) : ''}
      ${row('GST', sale.gstPaisa ? money(sale.gstPaisa) : '—')}
      ${row('NET TOTAL', `Rs ${money(sale.totalPaisa)}`, 'total')}
      ${row(PAYMENT_LABELS[sale.paymentMethod], money(sale.paidPaisa))}
      ${sale.changePaisa ? row('Change', money(sale.changePaisa)) : ''}
    </table>
    <hr>
    <div class="fbr"></div>
    <div class="c">${esc(shop.receiptFooter)}</div>
    <div class="c muted">Medicines once sold can be returned within the shop's return policy with this receipt.</div>`;
  return page(`Invoice ${sale.invoiceNo}`, body);
}

export function returnReceiptHtml(shop: ShopSettings, ret: ReturnDetail): string {
  const items = ret.lines
    .map(
      (l) => `
      <tr class="item"><td colspan="2" class="b">${esc(l.itemName)}</td></tr>
      ${row(`${l.qty} ${l.unit} · ${l.restocked ? 'restocked' : 'written off'}`, money(l.refundPaisa))}`,
    )
    .join('');
  const body = `
    ${header(shop)}
    <div class="c b">REFUND RECEIPT</div>
    <table>
      ${row(`Return #${String(ret.returnNo).padStart(6, '0')}`, `Inv #${String(ret.invoiceNo).padStart(6, '0')}`)}
      ${row(dateTime(ret.at), esc(ret.cashierName))}
    </table>
    <hr><table>${items}</table><hr>
    <table>
      ${ret.gstPaisa ? row('GST included', money(ret.gstPaisa)) : ''}
      ${row('REFUND', `Rs ${money(ret.refundPaisa)}`, 'total')}
      ${row('Paid back by', PAYMENT_LABELS[ret.refundMethod])}
    </table>
    ${ret.reason ? `<hr><div>Reason: ${esc(ret.reason)}</div>` : ''}
    <hr><div class="c">${esc(shop.receiptFooter)}</div>`;
  return page(`Return ${ret.returnNo}`, body);
}

export function testReceiptHtml(shop: ShopSettings): string {
  return page(
    'Test print',
    `${header(shop)}<div class="c b">TEST PRINT</div>
     <div class="c">${'1234567890'.repeat(4)}12345678</div>
     <div class="c">48 characters should fit on one line above.</div>
     <hr><div class="c">${dateTime(Date.now())}</div>`,
  );
}
