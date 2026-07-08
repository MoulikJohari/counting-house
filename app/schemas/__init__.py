from datetime import date as Date
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models import UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=6)
    role: UserRole = UserRole.user


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = Field(default=None, min_length=6)
    role: UserRole | None = None
    is_active: bool | None = None


class PaymentSchema(BaseModel):
    id: UUID
    date: Date
    amount: float

    model_config = {"from_attributes": True}


class PaymentCreate(BaseModel):
    date: Date
    amount: float


class POCreate(BaseModel):
    company: str
    ref: str | None = None
    date: Date
    amount: float
    gst_rate: float = 0
    notes: str | None = None


class POUpdate(BaseModel):
    company: str | None = None
    ref: str | None = None
    date: Date | None = None
    amount: float | None = None
    gst_rate: float | None = None
    notes: str | None = None


class POResponse(BaseModel):
    id: UUID
    company: str
    ref: str | None
    date: Date
    amount: float
    gst_rate: float
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    company: str
    ref: str | None = None
    date: Date
    due_date: Date | None = None
    po_id: UUID | None = None
    amount: float
    gst_rate: float = 0
    tds_rate: float = 0
    notes: str | None = None
    payments: list[PaymentCreate] = []


class InvoiceUpdate(BaseModel):
    company: str | None = None
    ref: str | None = None
    date: Date | None = None
    due_date: Date | None = None
    po_id: UUID | None = None
    amount: float | None = None
    gst_rate: float | None = None
    tds_rate: float | None = None
    notes: str | None = None
    payments: list[PaymentCreate] | None = None


class InvoiceResponse(BaseModel):
    id: UUID
    company: str
    ref: str | None
    date: Date
    due_date: Date | None
    po_id: UUID | None
    amount: float
    gst_rate: float
    tds_rate: float
    notes: str | None
    payments: list[PaymentSchema]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    category: str
    date: Date
    amount: float
    vendor: str | None = None
    notes: str | None = None


class ExpenseUpdate(BaseModel):
    category: str | None = None
    date: Date | None = None
    amount: float | None = None
    vendor: str | None = None
    notes: str | None = None


class ExpenseResponse(BaseModel):
    id: UUID
    category: str
    date: Date
    amount: float
    vendor: str | None
    notes: str | None
    recurring_id: UUID | None
    rkey: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecurringCreate(BaseModel):
    label: str
    category: str
    amount: float
    day: int = 1
    start: str


class RecurringResponse(BaseModel):
    id: UUID
    label: str
    category: str
    amount: float
    day: int
    start: str
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SettingsResponse(BaseModel):
    currency: str


class SettingsUpdate(BaseModel):
    currency: str


class AuditLogResponse(BaseModel):
    id: UUID
    user_id: UUID | None
    user_name: str | None = None
    user_email: str | None = None
    action: str
    entity_type: str
    entity_id: str | None
    summary: str
    changes: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    page: int
    limit: int


class LedgerDataResponse(BaseModel):
    currency: str
    pos: list[POResponse]
    invoices: list[InvoiceResponse]
    expenses: list[ExpenseResponse]
    recurring: list[RecurringResponse]
