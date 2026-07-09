import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger("app.email")


def send_email(to: str, subject: str, html_body: str, text_body: str | None = None) -> bool:
    """
    Sends a single email via SMTP (Gmail by default, per settings).
    Returns True if the send succeeded, False otherwise.
    Never raises — a broken email config should not break login/signup flows.
    """
    if not settings.smtp_user or not settings.smtp_password:
        logger.warning("SMTP not configured (smtp_user/smtp_password empty) — skipping email to %s", to)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email or settings.smtp_user}>"
    msg["To"] = to

    msg.attach(MIMEText(text_body or html_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, [to], msg.as_string())
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def send_login_alert_email(user_email: str, user_name: str) -> None:
    subject = "New login to your Counting House account"
    html = f"""
    <p>Hi {user_name},</p>
    <p>We noticed a new login to your Counting House account ({user_email}).</p>
    <p>If this was you, no action is needed. If you don't recognize this activity,
    please reset your password immediately.</p>
    """
    send_email(user_email, subject, html)


def send_password_reset_email(user_email: str, user_name: str, reset_link: str) -> None:
    subject = "Reset your Counting House password"
    html = f"""
    <p>Hi {user_name},</p>
    <p>We received a request to reset your password. Click the link below to choose a new one.
    This link expires in 30 minutes.</p>
    <p><a href="{reset_link}">{reset_link}</a></p>
    <p>If you didn't request this, you can safely ignore this email.</p>
    """
    send_email(user_email, subject, html)
