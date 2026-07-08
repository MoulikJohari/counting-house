import csv
import io
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, Expense, Invoice, InvoicePayment, PurchaseOrder, RecurringExpense, User


def num(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def parse_date(value: str | date | None) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def parse_csv_rows(content: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(content))
    rows = []
    for raw in reader:
        rows.append({(k or "").strip().lower().replace(" ", "_"): (v or "").strip() for k, v in raw.items()})
    return rows


def get_field(row: dict[str, str], *names: str) -> str | None:
    for name in names:
        key = name.strip().lower().replace(" ", "_")
        value = row.get(key)
        if value:
            return value
    return None


def inv_calc(invoice: Invoice | dict, today: date | None = None) -> dict:
    today = today or date.today()
    if isinstance(invoice, dict):
        taxable = num(invoice.get("amount"))
        gst_rate = num(invoice.get("gst_rate"))
        tds_rate = num(invoice.get("tds_rate"))
        payments = invoice.get("payments") or []
        due_date = invoice.get("due_date")
    else:
        taxable = num(invoice.amount)
        gst_rate = num(invoice.gst_rate)
        tds_rate = num(invoice.tds_rate)
        payments = invoice.payments or []
        due_date = invoice.due_date

    gst = taxable * gst_rate / 100
    gross = taxable + gst
    tds = taxable * tds_rate / 100
    net = gross - tds
    collected = sum(num(p.amount if hasattr(p, "amount") else p.get("amount")) for p in payments)
    balance = max(0, net - collected)
    status = "unpaid"
    if net > 0 and collected >= net - 0.5:
        status = "paid"
    elif collected > 0.5:
        status = "partial"
    overdue = status != "paid" and due_date and due_date < today
    return {
        "taxable": taxable,
        "gst": gst,
        "gross": gross,
        "tds": tds,
        "net": net,
        "collected": collected,
        "balance": balance,
        "status": status,
        "overdue": overdue,
    }


def po_calc(po: PurchaseOrder, invoices: list[Invoice]) -> dict:
    val = num(po.amount)
    inv = sum(num(i.amount) for i in invoices if i.po_id == po.id)
    remaining = max(0, val - inv)
    pct = min(100, round(inv / val * 100)) if val else 0
    return {"val": val, "inv": inv, "remaining": remaining, "pct": pct}


def fy_bounds(ref: date | None = None) -> tuple[date, date]:
    ref = ref or date.today()
    year = ref.year if ref.month >= 4 else ref.year - 1
    return date(year, 4, 1), date(year + 1, 3, 31)


def month_bounds(ref: date | None = None) -> tuple[date, date]:
    ref = ref or date.today()
    start = date(ref.year, ref.month, 1)
    if ref.month == 12:
        end = date(ref.year + 1, 1, 1)
    else:
        end = date(ref.year, ref.month + 1, 1)
    end = end - __import__("datetime").timedelta(days=1)
    return start, end


def in_period(d: date | None, period: str) -> bool:
    if period == "all" or not d:
        return period == "all"
    start, end = fy_bounds() if period == "fy" else month_bounds()
    return start <= d <= end


def generate_recurring(db: Session) -> None:
    now = datetime.utcnow()
    cur_key = f"{now.year}-{now.month:02d}"
    recurring_items = db.query(RecurringExpense).filter(RecurringExpense.active.is_(True)).all()
    for r in recurring_items:
        if not r.start:
            continue
        y, m = map(int, r.start.split("-"))
        while True:
            key = f"{y}-{m:02d}"
            if key > cur_key:
                break
            exists = (
                db.query(Expense)
                .filter(Expense.recurring_id == r.id, Expense.rkey == key)
                .first()
            )
            if not exists:
                day = min(max(r.day or 1, 1), 28)
                db.add(
                    Expense(
                        category=r.category,
                        amount=r.amount,
                        vendor=r.label,
                        notes="Recurring",
                        date=date(y, m, day),
                        recurring_id=r.id,
                        rkey=key,
                    )
                )
            m += 1
            if m > 12:
                m = 1
                y += 1
    db.commit()


class AuditService:
    @staticmethod
    def log(
        db: Session,
        *,
        user: User | None,
        action: str,
        entity_type: str,
        entity_id: str | None,
        summary: str,
        changes: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
            changes=changes,
        )
        db.add(entry)
        db.flush()
        return entry


def invoice_to_dict(invoice: Invoice) -> dict:
    return {
        "id": str(invoice.id),
        "company": invoice.company,
        "ref": invoice.ref,
        "date": invoice.date.isoformat(),
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "po_id": str(invoice.po_id) if invoice.po_id else None,
        "amount": invoice.amount,
        "gst_rate": invoice.gst_rate,
        "tds_rate": invoice.tds_rate,
        "notes": invoice.notes,
        "payments": [
            {"id": str(p.id), "date": p.date.isoformat(), "amount": p.amount}
            for p in invoice.payments
        ],
    }


def po_to_dict(po: PurchaseOrder) -> dict:
    return {
        "id": str(po.id),
        "company": po.company,
        "ref": po.ref,
        "date": po.date.isoformat(),
        "amount": po.amount,
        "gst_rate": po.gst_rate,
        "notes": po.notes,
    }


def expense_to_dict(expense: Expense) -> dict:
    return {
        "id": str(expense.id),
        "category": expense.category,
        "date": expense.date.isoformat(),
        "amount": expense.amount,
        "vendor": expense.vendor,
        "notes": expense.notes,
        "recurring_id": str(expense.recurring_id) if expense.recurring_id else None,
        "rkey": expense.rkey,
    }
