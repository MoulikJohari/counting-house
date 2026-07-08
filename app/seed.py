from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import settings
from app.database import SessionLocal
from app.models import AppSettings, User, UserRole


def seed_superadmin() -> None:
    db: Session = SessionLocal()
    try:
        if not db.get(AppSettings, 1):
            db.add(AppSettings(id=1, currency="₹"))

        existing = db.query(User).filter(User.email == settings.superadmin_email.lower()).first()
        if not existing:
            db.add(
                User(
                    email=settings.superadmin_email.lower(),
                    name=settings.superadmin_name,
                    password_hash=hash_password(settings.superadmin_password),
                    role=UserRole.superadmin,
                    is_active=True,
                )
            )
        db.commit()
    finally:
        db.close()
