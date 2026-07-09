import json
import logging
import sys
import urllib.error
import urllib.request

from app.config import settings

logger = logging.getLogger("app.email")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(asctime)s | app.email | %(levelname)s | %(message)s"))
    logger.addHandler(_handler)
    logger.propagate = False

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def send_email(to: str, subject: str, html_body: str, text_body: str | None = None) -> bool:
    """
    Sends a single email via the Brevo HTTP API (port 443 — not blocked by Render's
    free-tier SMTP port restriction, unlike raw smtplib).
    Returns True if the send succeeded, False otherwise.
    Never raises — a broken email config should not break login/signup flows.
    """
    if not settings.brevo_api_key:
        logger.warning("BREVO_API_KEY not configured — skipping email to %s", to)
        return False

    payload = {
        "sender": {
            "name": settings.smtp_from_name,
            "email": settings.smtp_from_email,
        },
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html_body,
    }
    if text_body:
        payload["textContent"] = text_body

    req = urllib.request.Request(
        BREVO_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": settings.brevo_api_key,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
        logger.info("Email sent successfully to %s (subject=%r)", to, subject)
        return True
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.error("Brevo rejected email to %s: HTTP %s: %s", to, exc.code, body)
        return False
    except Exception as exc:
        logger.error("Failed to send email to %s: %s: %s", to, type(exc).__name__, exc)
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
