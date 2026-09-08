@echo off
echo ==============================================
echo HotelOS serverini ishga tushirish (FastAPI)
echo ==============================================
cd backend
call .\venv\Scripts\activate.bat
uvicorn main:app --reload --host 0.0.0.0 --port 3000
pause
