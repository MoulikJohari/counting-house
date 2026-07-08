from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers.auth import router as auth_router
from app.routers.ledger import logs_router, router as ledger_router, users_router
from app.seed import seed_superadmin
from app.services.ledger import generate_recurring


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_superadmin()
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        generate_recurring(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Counting House API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(ledger_router)
app.include_router(users_router)
app.include_router(logs_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}

# Serve React frontend static assets (CSS/JS files)
if os.path.isdir("dist"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")

# Catch-all route to serve the React index.html for all frontend pages
@app.get("/{catchall:path}")
async def serve_react_app(catchall: str):
    index_path = os.path.join("dist", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend build not found"}