import csv
import io
import json
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, hash_password, require_superadmin
from app.database import get_db
from app.models import (
    AppSettings,
    AuditLog,
    Expense,
    Invoice,
    InvoicePayment,
    PurchaseOrder,
    RecurringExpense,
    User,
    UserRole,
)
from app.schemas import (
    AuditLogListResponse,
    AuditLogResponse,
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
    InvoiceCreate,
    InvoiceResponse,
    InvoiceUpdate,
    LedgerDataResponse,
    PaymentCreate,
    POCreate,
    POResponse,
    POUpdate,
    RecurringCreate,
    RecurringResponse,
    SettingsResponse,
    SettingsUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.services.ledger import (
    AuditService,
    expense_to_dict,
    generate_recurring,
    get_field,
    inv_calc,
    invoice_to_dict,
    num,
    parse_csv_rows,
    parse_date,
    po_calc,
    po_to_dict,
)

router = APIRouter(tags=["ledger"])
users_router = APIRouter(prefix="/api/users", tags=["users"])
logs_router = APIRouter(prefix="/api/logs", tags=["logs"])


def get_settings(db: Session) -> AppSettings:
    settings = db.get(AppSettings, 1)
    if not settings:
        settings = AppSettings(id=1, currency="₹")
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/api/ledger", response_model=LedgerDataResponse)
def get_ledger(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    generate_recurring(db)
    settings = get_settings(db)
    pos = db.query(PurchaseOrder).order_by(PurchaseOrder.date.desc()).all()
    invoices = (
        db.query(Invoice)
        .options(joinedload(Invoice.payments))
        .order_by(Invoice.date.desc())
        .all()
    )
    expenses = db.query(Expense).order_by(Expense.date.desc()).all()
    recurring = db.query(RecurringExpense).order_by(RecurringExpense.created_at.desc()).all()
    return LedgerDataResponse(
        currency=settings.currency,
        pos=pos,
        invoices=invoices,
        expenses=expenses,
        recurring=recurring,
    )


@router.get("/api/settings", response_model=SettingsResponse)
def read_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_settings(db)


@router.patch("/api/settings", response_model=SettingsResponse)
def update_settings(
    body: SettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = get_settings(db)
    before = {"currency": settings.currency}
    settings.currency = body.currency
    AuditService.log(
        db,
        user=user,
        action="update",
        entity_type="settings",
        entity_id="1",
        summary=f"Updated currency to {body.currency}",
        changes={"before": before, "after": {"currency": body.currency}},
    )
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/api/pos", response_model=list[POResponse])
def list_pos(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(PurchaseOrder).order_by(PurchaseOrder.date.desc()).all()


@router.post("/api/pos", response_model=POResponse, status_code=status.HTTP_201_CREATED)
def create_po(
    body: POCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    po = PurchaseOrder(**body.model_dump(), created_by=user.id)
    db.add(po)
    db.flush()
    AuditService.log(
        db,
        user=user,
        action="create",
        entity_type="po",
        entity_id=str(po.id),
        summary=f"Created PO {po.ref or po.company} for {po.company}",
        changes={"after": po_to_dict(po)},
    )
    db.commit()
    db.refresh(po)
    return po


@router.patch("/api/pos/{po_id}", response_model=POResponse)
def update_po(
    po_id: UUID,
    body: POUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    before = po_to_dict(po)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(po, k, v)
    AuditService.log(
        db,
        user=user,
        action="update",
        entity_type="po",
        entity_id=str(po.id),
        summary=f"Updated PO {po.ref or po.company}",
        changes={"before": before, "after": po_to_dict(po)},
    )
    db.commit()
    db.refresh(po)
    return po


@router.delete("/api/pos/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_po(
    po_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    po = db.get(PurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    before = po_to_dict(po)
    AuditService.log(
        db,
        user=user,
        action="delete",
        entity_type="po",
        entity_id=str(po.id),
        summary=f"Deleted PO {po.ref or po.company}",
        changes={"before": before},
    )
    db.delete(po)
    db.commit()


@router.get("/api/invoices", response_model=list[InvoiceResponse])
def list_invoices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Invoice)
        .options(joinedload(Invoice.payments))
        .order_by(Invoice.date.desc())
        .all()
    )


@router.post("/api/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = body.model_dump(exclude={"payments"})
    invoice = Invoice(**data, created_by=user.id)
    db.add(invoice)
    db.flush()
    for p in body.payments:
        db.add(InvoicePayment(invoice_id=invoice.id, date=p.date, amount=p.amount))
    db.flush()
    db.refresh(invoice)
    AuditService.log(
        db,
        user=user,
        action="create",
        entity_type="invoice",
        entity_id=str(invoice.id),
        summary=f"Created invoice {invoice.ref or invoice.company} for {invoice.company}",
        changes={"after": invoice_to_dict(invoice)},
    )
    db.commit()
    db.refresh(invoice)
    return invoice


@router.patch("/api/invoices/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    invoice_id: UUID,
    body: InvoiceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.payments))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    before = invoice_to_dict(invoice)
    data = body.model_dump(exclude_unset=True, exclude={"payments"})
    for k, v in data.items():
        setattr(invoice, k, v)
    if body.payments is not None:
        for p in list(invoice.payments):
            db.delete(p)
        for p in body.payments:
            db.add(InvoicePayment(invoice_id=invoice.id, date=p.date, amount=p.amount))
    db.flush()
    db.refresh(invoice)
    AuditService.log(
        db,
        user=user,
        action="update",
        entity_type="invoice",
        entity_id=str(invoice.id),
        summary=f"Updated invoice {invoice.ref or invoice.company}",
        changes={"before": before, "after": invoice_to_dict(invoice)},
    )
    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/api/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    before = invoice_to_dict(invoice)
    AuditService.log(
        db,
        user=user,
        action="delete",
        entity_type="invoice",
        entity_id=str(invoice.id),
        summary=f"Deleted invoice {invoice.ref or invoice.company}",
        changes={"before": before},
    )
    db.delete(invoice)
    db.commit()


@router.post("/api/invoices/{invoice_id}/payments", response_model=InvoiceResponse)
def add_payment(
    invoice_id: UUID,
    body: PaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.payments))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payment = InvoicePayment(invoice_id=invoice.id, date=body.date, amount=body.amount)
    db.add(payment)
    db.flush()
    AuditService.log(
        db,
        user=user,
        action="payment_add",
        entity_type="payment",
        entity_id=str(payment.id),
        summary=f"Added payment of {body.amount} to invoice {invoice.ref or invoice.company}",
        changes={"invoice_id": str(invoice.id), "payment": {"date": body.date.isoformat(), "amount": body.amount}},
    )
    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/api/invoices/{invoice_id}/payments/{payment_id}", response_model=InvoiceResponse)
def remove_payment(
    invoice_id: UUID,
    payment_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.payments))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payment = db.get(InvoicePayment, payment_id)
    if not payment or payment.invoice_id != invoice.id:
        raise HTTPException(status_code=404, detail="Payment not found")
    AuditService.log(
        db,
        user=user,
        action="payment_remove",
        entity_type="payment",
        entity_id=str(payment.id),
        summary=f"Removed payment of {payment.amount} from invoice {invoice.ref or invoice.company}",
        changes={"invoice_id": str(invoice.id), "payment": {"date": payment.date.isoformat(), "amount": payment.amount}},
    )
    db.delete(payment)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/api/expenses", response_model=list[ExpenseResponse])
def list_expenses(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    generate_recurring(db)
    return db.query(Expense).order_by(Expense.date.desc()).all()


@router.post("/api/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(
    body: ExpenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expense = Expense(**body.model_dump(), created_by=user.id)
    db.add(expense)
    db.flush()
    AuditService.log(
        db,
        user=user,
        action="create",
        entity_type="expense",
        entity_id=str(expense.id),
        summary=f"Created expense {expense.category} — {expense.vendor or expense.amount}",
        changes={"after": expense_to_dict(expense)},
    )
    db.commit()
    db.refresh(expense)
    return expense


@router.patch("/api/expenses/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: UUID,
    body: ExpenseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    before = expense_to_dict(expense)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(expense, k, v)
    AuditService.log(
        db,
        user=user,
        action="update",
        entity_type="expense",
        entity_id=str(expense.id),
        summary=f"Updated expense {expense.category}",
        changes={"before": before, "after": expense_to_dict(expense)},
    )
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/api/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    before = expense_to_dict(expense)
    AuditService.log(
        db,
        user=user,
        action="delete",
        entity_type="expense",
        entity_id=str(expense.id),
        summary=f"Deleted expense {expense.category}",
        changes={"before": before},
    )
    db.delete(expense)
    db.commit()


@router.get("/api/recurring", response_model=list[RecurringResponse])
def list_recurring(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(RecurringExpense).order_by(RecurringExpense.created_at.desc()).all()


@router.post("/api/recurring", response_model=RecurringResponse, status_code=status.HTTP_201_CREATED)
def create_recurring(
    body: RecurringCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recurring = RecurringExpense(**body.model_dump(), active=True)
    db.add(recurring)
    db.flush()
    generate_recurring(db)
    AuditService.log(
        db,
        user=user,
        action="create",
        entity_type="recurring",
        entity_id=str(recurring.id),
        summary=f"Created recurring expense {recurring.label}",
        changes={"after": {"id": str(recurring.id), "label": recurring.label, "amount": recurring.amount}},
    )
    db.commit()
    db.refresh(recurring)
    return recurring


@router.delete("/api/recurring/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring(
    recurring_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recurring = db.get(RecurringExpense, recurring_id)
    if not recurring:
        raise HTTPException(status_code=404, detail="Recurring expense not found")
    AuditService.log(
        db,
        user=user,
        action="delete",
        entity_type="recurring",
        entity_id=str(recurring.id),
        summary=f"Deleted recurring expense {recurring.label}",
        changes={"before": {"id": str(recurring.id), "label": recurring.label}},
    )
    db.delete(recurring)
    db.commit()


@router.get("/api/backup.json")
def backup_json(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    generate_recurring(db)
    settings = get_settings(db)
    pos = db.query(PurchaseOrder).all()
    invoices = db.query(Invoice).options(joinedload(Invoice.payments)).all()
    expenses = db.query(Expense).all()
    recurring = db.query(RecurringExpense).all()
    data = {
        "version": 2,
        "currency": settings.currency,
        "pos": [po_to_dict(p) for p in pos],
        "invoices": [invoice_to_dict(i) for i in invoices],
        "expenses": [expense_to_dict(e) for e in expenses],
        "recurring": [
            {
                "id": str(r.id),
                "label": r.label,
                "category": r.category,
                "amount": r.amount,
                "day": r.day,
                "start": r.start,
                "active": r.active,
            }
            for r in recurring
        ],
    }
    return Response(
        content=json.dumps(data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=counting-house-backup.json"},
    )


@router.post("/api/restore")
def restore_json(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not payload or not isinstance(payload.get("pos"), list):
        raise HTTPException(status_code=400, detail="Invalid backup format")

    db.query(InvoicePayment).delete()
    db.query(Invoice).delete()
    db.query(Expense).delete()
    db.query(RecurringExpense).delete()
    db.query(PurchaseOrder).delete()

    for p in payload.get("pos", []):
        db.add(
            PurchaseOrder(
                id=UUID(p["id"]) if len(str(p.get("id", ""))) == 36 else None,
                company=p["company"],
                ref=p.get("ref"),
                date=parse_date(p["date"]),
                amount=p.get("amount", 0),
                gst_rate=p.get("gst_rate", 0),
                notes=p.get("notes"),
            )
        )
    db.flush()

    for i in payload.get("invoices", []):
        inv = Invoice(
            id=UUID(i["id"]) if len(str(i.get("id", ""))) == 36 else None,
            company=i["company"],
            ref=i.get("ref"),
            date=parse_date(i["date"]),
            due_date=parse_date(i.get("due_date")),
            po_id=UUID(i["po_id"]) if i.get("po_id") else None,
            amount=i.get("amount", 0),
            gst_rate=i.get("gst_rate", 0),
            tds_rate=i.get("tds_rate", 0),
            notes=i.get("notes"),
        )
        db.add(inv)
        db.flush()
        for pay in i.get("payments", []):
            db.add(
                InvoicePayment(
                    invoice_id=inv.id,
                    date=parse_date(pay["date"]),
                    amount=pay.get("amount", 0),
                )
            )

    for e in payload.get("expenses", []):
        db.add(
            Expense(
                category=e["category"],
                date=parse_date(e["date"]),
                amount=e.get("amount", 0),
                vendor=e.get("vendor"),
                notes=e.get("notes"),
                recurring_id=UUID(e["recurring_id"]) if e.get("recurring_id") else None,
                rkey=e.get("rkey"),
            )
        )

    for r in payload.get("recurring", []):
        db.add(
            RecurringExpense(
                label=r["label"],
                category=r["category"],
                amount=r.get("amount", 0),
                day=r.get("day", 1),
                start=r["start"],
                active=r.get("active", True),
            )
        )

    if payload.get("currency"):
        settings = get_settings(db)
        settings.currency = payload["currency"]

    generate_recurring(db)
    AuditService.log(
        db,
        user=user,
        action="restore",
        entity_type="settings",
        entity_id="backup",
        summary="Restored ledger from backup",
        changes={"pos": len(payload.get("pos", [])), "invoices": len(payload.get("invoices", []))},
    )
    db.commit()
    return {"ok": True}


@router.get("/api/export/{kind}.csv")
def export_csv(
    kind: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    output = io.StringIO()
    writer = csv.writer(output)
    if kind == "pos":
        pos = db.query(PurchaseOrder).all()
        invoices = db.query(Invoice).all()
        writer.writerow(["date", "company", "ref", "amount", "gstRate", "invoiced", "remaining", "notes"])
        for p in pos:
            c = po_calc(p, invoices)
            writer.writerow([p.date, p.company, p.ref, c["val"], p.gst_rate, c["inv"], c["remaining"], p.notes])
        filename = "pos.csv"
    elif kind == "invoices":
        invoices = db.query(Invoice).options(joinedload(Invoice.payments)).all()
        writer.writerow(
            ["date", "company", "ref", "dueDate", "taxable", "gstRate", "gst", "gross", "tdsRate", "tds", "net", "collected", "balance", "status"]
        )
        for i in invoices:
            c = inv_calc(i)
            writer.writerow(
                [
                    i.date,
                    i.company,
                    i.ref,
                    i.due_date,
                    c["taxable"],
                    i.gst_rate,
                    round(c["gst"]),
                    round(c["gross"]),
                    i.tds_rate,
                    round(c["tds"]),
                    round(c["net"]),
                    round(c["collected"]),
                    round(c["balance"]),
                    "overdue" if c["overdue"] else c["status"],
                ]
            )
        filename = "invoices.csv"
    elif kind == "expenses":
        expenses = db.query(Expense).all()
        writer.writerow(["date", "category", "vendor", "amount", "notes"])
        for e in expenses:
            writer.writerow([e.date, e.category, e.vendor, e.amount, e.notes])
        filename = "expenses.csv"
    else:
        raise HTTPException(status_code=404, detail="Unknown export type")

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


async def _read_csv_rows(file: UploadFile) -> list[dict[str, str]]:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")
    raw = await file.read()
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc
    rows = parse_csv_rows(content)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file has no data rows")
    return rows


@router.post("/api/import/pos")
async def import_pos_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = await _read_csv_rows(file)
    created = 0
    errors: list[str] = []
    for idx, row in enumerate(rows, start=2):
        company = get_field(row, "company")
        if not company:
            errors.append(f"Row {idx}: company is required")
            continue
        try:
            po = PurchaseOrder(
                company=company,
                ref=get_field(row, "ref", "po_ref", "po_number"),
                date=parse_date(get_field(row, "date")) or date.today(),
                amount=num(get_field(row, "amount", "value")),
                gst_rate=num(get_field(row, "gst_rate", "gstrate")),
                notes=get_field(row, "notes"),
                created_by=user.id,
            )
            db.add(po)
            created += 1
        except Exception as exc:  # noqa: BLE001 - surface row-level errors to the caller
            errors.append(f"Row {idx}: {exc}")
    db.flush()
    AuditService.log(
        db,
        user=user,
        action="import",
        entity_type="po",
        entity_id=None,
        summary=f"Imported {created} purchase order(s) from CSV",
        changes={"created": created, "errors": errors},
    )
    db.commit()
    return {"created": created, "errors": errors}


@router.post("/api/import/invoices")
async def import_invoices_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = await _read_csv_rows(file)
    created = 0
    errors: list[str] = []
    for idx, row in enumerate(rows, start=2):
        company = get_field(row, "company")
        if not company:
            errors.append(f"Row {idx}: company is required")
            continue
        try:
            po_id_raw = get_field(row, "po_id")
            invoice = Invoice(
                company=company,
                ref=get_field(row, "ref", "invoice_ref", "invoice_number"),
                date=parse_date(get_field(row, "date")) or date.today(),
                due_date=parse_date(get_field(row, "due_date", "duedate")),
                po_id=UUID(po_id_raw) if po_id_raw else None,
                amount=num(get_field(row, "amount", "taxable")),
                gst_rate=num(get_field(row, "gst_rate", "gstrate")),
                tds_rate=num(get_field(row, "tds_rate", "tdsrate")),
                notes=get_field(row, "notes"),
                created_by=user.id,
            )
            db.add(invoice)
            created += 1
        except Exception as exc:  # noqa: BLE001 - surface row-level errors to the caller
            errors.append(f"Row {idx}: {exc}")
    db.flush()
    AuditService.log(
        db,
        user=user,
        action="import",
        entity_type="invoice",
        entity_id=None,
        summary=f"Imported {created} invoice(s) from CSV",
        changes={"created": created, "errors": errors},
    )
    db.commit()
    return {"created": created, "errors": errors}


@router.post("/api/import/expenses")
async def import_expenses_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = await _read_csv_rows(file)
    created = 0
    errors: list[str] = []
    for idx, row in enumerate(rows, start=2):
        category = get_field(row, "category")
        if not category:
            errors.append(f"Row {idx}: category is required")
            continue
        try:
            expense = Expense(
                category=category,
                date=parse_date(get_field(row, "date")) or date.today(),
                amount=num(get_field(row, "amount")),
                vendor=get_field(row, "vendor"),
                notes=get_field(row, "notes"),
                created_by=user.id,
            )
            db.add(expense)
            created += 1
        except Exception as exc:  # noqa: BLE001 - surface row-level errors to the caller
            errors.append(f"Row {idx}: {exc}")
    db.flush()
    AuditService.log(
        db,
        user=user,
        action="import",
        entity_type="expense",
        entity_id=None,
        summary=f"Imported {created} expense(s) from CSV",
        changes={"created": created, "errors": errors},
    )
    db.commit()
    return {"created": created, "errors": errors}


@users_router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), user: User = Depends(require_superadmin)):
    return db.query(User).order_by(User.created_at.desc()).all()


@users_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = User(
        email=body.email.lower(),
        name=body.name,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(new_user)
    db.flush()
    AuditService.log(
        db,
        user=admin,
        action="user_create",
        entity_type="user",
        entity_id=str(new_user.id),
        summary=f"Created user {new_user.email}",
        changes={"after": {"email": new_user.email, "name": new_user.name, "role": new_user.role.value}},
    )
    db.commit()
    db.refresh(new_user)
    return new_user


@users_router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    before = {"email": target.email, "name": target.name, "role": target.role.value, "is_active": target.is_active}

    if body.is_active is False and target.role == UserRole.superadmin:
        superadmin_count = db.query(User).filter(User.role == UserRole.superadmin, User.is_active.is_(True)).count()
        if superadmin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot deactivate the last superadmin")

    if body.name is not None:
        target.name = body.name
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.password:
        target.password_hash = hash_password(body.password)

    action = "user_deactivate" if body.is_active is False else "user_update"
    AuditService.log(
        db,
        user=admin,
        action=action,
        entity_type="user",
        entity_id=str(target.id),
        summary=f"Updated user {target.email}",
        changes={"before": before, "after": {"email": target.email, "name": target.name, "role": target.role.value, "is_active": target.is_active}},
    )
    db.commit()
    db.refresh(target)
    return target


@logs_router.get("", response_model=AuditLogListResponse)
def list_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    entity_type: str | None = None,
    action: str | None = None,
    user_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_superadmin),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if action:
        q = q.filter(AuditLog.action == action)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)

    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    response_items = []
    for item in items:
        u = db.get(User, item.user_id) if item.user_id else None
        response_items.append(
            AuditLogResponse(
                id=item.id,
                user_id=item.user_id,
                user_name=u.name if u else None,
                user_email=u.email if u else None,
                action=item.action,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                summary=item.summary,
                changes=item.changes,
                created_at=item.created_at,
            )
        )
    return AuditLogListResponse(items=response_items, total=total, page=page, limit=limit)
