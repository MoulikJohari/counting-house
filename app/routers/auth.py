from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    create_reset_token,
    get_current_user,
    hash_password,
    verify_password,
    verify_reset_token,
)
from app.config import settings
from app.database import get_db
from app.logging_config import log_login_failure, log_login_success
from app.models import User
from app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
)
from app.services.email import send_login_alert_email, send_password_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email = body.email.lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        log_login_failure(email, "invalid_credentials")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        log_login_failure(email, "inactive_account")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive")
    token = create_access_token(str(user.id))
    log_login_success(user.email, user.role.value)
    # Sent in the background so a slow/broken SMTP connection never delays login.
    background_tasks.add_task(send_login_alert_email, user.email, user.name)
    return TokenResponse(access_token=token)


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email = body.email.lower()
    user = db.query(User).filter(User.email == email).first()
    # Always return the same response whether or not the email exists,
    # so this endpoint can't be used to check which emails are registered.
    if user and user.is_active:
        reset_token = create_reset_token(str(user.id))
        reset_link = f"{settings.frontend_url}/reset-password?token={reset_token}"
        background_tasks.add_task(send_password_reset_email, user.email, user.name, reset_link)
    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = verify_reset_token(body.token)
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated successfully."}


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user