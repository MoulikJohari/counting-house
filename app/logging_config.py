import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

security_logger = logging.getLogger("counting_house.security")
security_logger.setLevel(logging.INFO)

if not security_logger.handlers:
    handler = RotatingFileHandler(
        LOG_DIR / "security.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    security_logger.addHandler(handler)
    security_logger.propagate = False


def log_login_success(email: str, role: str) -> None:
    security_logger.info("LOGIN_SUCCESS email=%s role=%s", email, role)


def log_login_failure(email: str, reason: str) -> None:
    security_logger.warning("LOGIN_FAILURE email=%s reason=%s", email, reason)


def log_access_denied(email: str, role: str, path: str, required: str) -> None:
    security_logger.warning(
        "ACCESS_DENIED email=%s role=%s path=%s required=%s", email, role, path, required
    )
