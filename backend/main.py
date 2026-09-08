import os
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router
from app.api.ws import router as ws_router
from app.utils.logger import logger
from app.services.notification_service import notification_service

app = FastAPI(title="HotelOS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    if request.url.path.startswith("/api"):
        if response.status_code >= 400:
            logger.warn(f"[HTTP] {request.method} {request.url.path} -> {response.status_code} ({process_time:.2f}ms)")
        else:
            logger.debug(f"[HTTP] {request.method} {request.url.path} -> {response.status_code} ({process_time:.2f}ms)")
    return response

app.include_router(api_router, prefix="/api")
app.include_router(ws_router)

# Exception handler to override standard FastAPI HTTPExceptions globally if needed, though they are mostly 4xx
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"[ERROR] {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"error": "Server xatosi yuz berdi."}
    )

frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend')

class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as ex:
            if ex.status_code == 404:
                return FileResponse(os.path.join(frontend_path, "index.html"))
            raise ex

if os.path.exists(frontend_path):
    app.mount("/", SPAStaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    logger.warn(f"Frontend folder not found at {frontend_path}")

@app.on_event("startup")
async def startup_event():
    logger.info("HotelOS 8000-portda tinglamoqda")
    notification_service.start_periodic_check()

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Server to'xtatilmoqda...")
    notification_service.stop()
