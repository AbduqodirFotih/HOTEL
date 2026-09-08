import time
from app.data import historical_seed

NOW = int(time.time() * 1000)
ONE_HOUR = 1000 * 60 * 60

rooms = [
  {"number": 101, "floor": 1, "type": 'single', "status": 'available', "nightlyRate": 350000, "nearElevator": True, "nearStairs": False, "lastCleanedAt": NOW - 2 * ONE_HOUR},
  {"number": 102, "floor": 1, "type": 'single', "status": 'available', "nightlyRate": 350000, "nearElevator": True, "nearStairs": False, "lastCleanedAt": NOW - 5 * ONE_HOUR},
  {"number": 103, "floor": 1, "type": 'double', "status": 'available', "nightlyRate": 550000, "nearElevator": False, "nearStairs": False, "lastCleanedAt": NOW - 7 * ONE_HOUR},
  {"number": 104, "floor": 1, "type": 'double', "status": 'cleaning_required', "nightlyRate": 550000, "nearElevator": False, "nearStairs": True, "lastCleanedAt": NOW - 14 * ONE_HOUR, "dirtyAt": NOW - 1.5 * ONE_HOUR},
  {"number": 105, "floor": 1, "type": 'accessible', "status": 'available', "nightlyRate": 400000, "nearElevator": True, "nearStairs": False, "lastCleanedAt": NOW - 3 * ONE_HOUR},

  {"number": 201, "floor": 2, "type": 'single', "status": 'available', "nightlyRate": 350000, "nearElevator": True, "nearStairs": False, "lastCleanedAt": NOW - 9 * ONE_HOUR},
  {"number": 202, "floor": 2, "type": 'double', "status": 'available', "nightlyRate": 550000, "nearElevator": True, "nearStairs": False, "lastCleanedAt": NOW - 11 * ONE_HOUR},
  {"number": 203, "floor": 2, "type": 'double', "status": 'available', "nightlyRate": 550000, "nearElevator": False, "nearStairs": False, "lastCleanedAt": NOW - 6 * ONE_HOUR},
  {"number": 204, "floor": 2, "type": 'suite', "status": 'occupied', "nightlyRate": 1200000, "nearElevator": False, "nearStairs": False, "lastCleanedAt": NOW - 18 * ONE_HOUR, "occupiedBy": 'guest_demo_001', "occupiedAt": NOW - 2 * 24 * ONE_HOUR},
  {"number": 205, "floor": 2, "type": 'suite', "status": 'available', "nightlyRate": 1200000, "nearElevator": False, "nearStairs": True, "lastCleanedAt": NOW - 4 * ONE_HOUR},
]

menu = [
  {"id": 'espresso',   "name": 'Espresso',           "category": 'drink', "price": 25000},
  {"id": 'coffee',     "name": 'Amerikano',          "category": 'drink', "price": 30000},
  {"id": 'cappuccino', "name": 'Kapuchino',          "category": 'drink', "price": 38000},
  {"id": 'tea',        "name": 'Choy (qora/yashil)', "category": 'drink', "price": 18000},
  {"id": 'water',      "name": 'Mineral suv (0.5L)', "category": 'drink', "price": 15000},
  {"id": 'juice',      "name": 'Tabiiy sharbat',     "category": 'drink', "price": 35000},
  {"id": 'sandwich',   "name": 'Klub sandvich',      "category": 'food',  "price": 65000},
  {"id": 'pizza',      "name": 'Margarita pitsa',    "category": 'food',  "price": 120000},
  {"id": 'salad',      "name": 'Sezar salatasi',     "category": 'food',  "price": 55000},
  {"id": 'pasta',      "name": 'Karbonara',          "category": 'food',  "price": 85000},
  {"id": 'soup',       "name": 'Lag\'mon',            "category": 'food',  "price": 45000},
  {"id": 'breakfast',  "name": 'Kontinental nonushta', "category": 'food', "price": 90000},
  {"id": 'dessert',    "name": 'Tort bo\'lagi',       "category": 'food',  "price": 40000},
  {"id": 'fruit',      "name": 'Mavsumiy mevalar',   "category": 'food',  "price": 50000},
]

technicians = [
  {"id": 'tech_01', "name": 'Akmal Rasulov',  "specialty": 'plumbing',   "available": True},
  {"id": 'tech_02', "name": 'Bekzod Tursunov', "specialty": 'electrical', "available": True},
  {"id": 'tech_03', "name": 'Sardor Aliyev',   "specialty": 'general',    "available": True},
]

housekeepers = [
  {"id": 'hk_01', "name": 'Munira Karimova',  "available": True},
  {"id": 'hk_02', "name": 'Dilfuza Saidova',  "available": True},
]

guests = [
  {
    "id": 'guest_demo_001',
    "name": 'Aziz Karimov',
    "roomNumber": 204,
    "checkInAt": NOW - 2 * 24 * ONE_HOUR,
    "nights": 3,
    "paymentMethod": 'card',
    "extraCharges": [],
  },
]

orders = []
maintenanceRequests = []
notifications = []

bookingHistory = historical_seed.booking_history
maintenanceHistory = historical_seed.maintenance_history
cleaningHistory = historical_seed.cleaning_history
staffPerformance = historical_seed.staff_performance
