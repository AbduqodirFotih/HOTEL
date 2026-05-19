# HotelOS — GrandStay Hotel uchun Real Vaqtli Boshqaruv Tizimi

> **BTEC HND** · Module 4 · Dasturlash · Amaliy Topshiriq
> **Talaba:** Shahzod Nematov · PDP University · BIT bo'limi
> **Mavzu:** 4-yulduzli, 120 xonali mehmonxona uchun mikroservis asosidagi
> real vaqtli operatsiyalar paneli.

---

## ⚡ Tezkor boshlash (VS Code)

```bash
# 1. Loyihaga kiring
cd hotelos

# 2. Bog'liqliklarni o'rnating (faqat 2 ta: express, ws)
npm install

# 3. Serverni ishga tushiring
npm start
```

Brauzeringizda **<http://localhost:3000>** ni oching va quyidagi hisoblardan biri bilan kiring:

| Foydalanuvchi     | Parol                | Rol           | Kirish nimaga ruxsat etiladi                     |
|-------------------|----------------------|---------------|---------------------------------------------------|
| `admin`           | `admin123`           | Bosh menejer  | Hamma sahifa, hamma operatsiya, statistika, sozlamalar |
| `reception`       | `reception123`       | Qabul         | Check-in/out, buyurtmalar, mehmonlar, narxlar    |
| `housekeeping`    | `housekeeping123`    | Tozalash      | Faqat tozalash navbati va vaqt o'lchagichlar     |
| `maintenance`     | `maintenance123`     | Texnik xodim  | Faqat texnik xizmat so'rovlari (ustuvorlik navbati) |

> **Testlarni ishga tushirish:** `npm test` — 8 ta avtomatik test stsenariy
> (TS-01 → TS-08) ketma-ket bajariladi va natijalar terminalda ko'rsatiladi.

---

## 🏗 Tizim Arxitekturasi

```
   ┌──────────────────────────────────────────┐
   │  Web Mijoz (Vanilla JS · WebSocket)      │
   └─────────────┬────────────────────┬───────┘
                 │  HTTP/REST         │  WebSocket
   ┌─────────────▼────────────────────▼───────┐
   │     Express Server (server.js)           │
   └─────────────────┬────────────────────────┘
                     ▼
            ┌───────────────────┐
            │  Xabar Brokeri    │   ← In-memory Pub/Sub
            │  (singleton)      │
            └───────┬───────────┘
       publish ▲    │    ▲ subscribe
               │    │    │
    ┌──────────┴────┼────┴────────────┬─────────────┐
    │               │                 │             │
┌───▼─────┐   ┌─────▼─────┐   ┌───────▼────┐   ┌────▼─────┐
│ Qabul   │   │ Tozalash  │   │ Xona       │   │ Texnik   │
│ Reception │ │ House-    │   │ Xizmati    │   │ Xizmat   │
│         │   │ keeping   │   │ Room Svc   │   │ Maintenance │
└─────────┘   └───────────┘   └────────────┘   └──────────┘
    │               │                 │             │
    └───────────────┴────────┬────────┴─────────────┘
                             ▼
                    ┌────────────────┐
                    │  Saqlash       │
                    │  (data.json)   │
                    └────────────────┘
```

### Mikroservislar (4 ta, bitta jarayonda — pragmatik soddalashtirish)

| Servis             | Mas'uliyati                                                             |
|--------------------|--------------------------------------------------------------------------|
| **Reception**      | Check-in, check-out, xona tayinlash algoritmi, hisob-kitob              |
| **Housekeeping**   | Tozalash navbati (FIFO), 12-soatlik tsikl, holat o'tishlari             |
| **Room Service**   | Ovqat buyurtmalari, holat ishlov beruvchi (received→preparing→delivering→delivered) |
| **Maintenance**    | Ustuvorlik navbati (critical→high→normal→low), texnikka avtomatik tayinlash |
| **Notification**   | Davriy 12-soatlik tekshiruv, bildirishnomalar bazasi                    |

Eslatma: ishlab chiqarish muhitida bu servislar alohida jarayonlar bo'lishi
kerak. Topshiriq miqyosi va "VS Code da darhol ishlashi kerak" talabi tufayli
biz ularni bitta Node.js jarayonida, lekin **brokerdan tashqari to'g'ridan-to'g'ri
chaqirmaslik tamoyili** bilan birlashtirdik. Bu kelajakda har bir servisni
alohida konteyner sifatida ajratish imkonini beradi.

### Ma'lumotlar Tuzilmalari

| Tuzilma            | Foydalanish joyi                     | Tanlanish sababi                          |
|--------------------|--------------------------------------|--------------------------------------------|
| **Array**          | Xonalar inventari (10 ta)            | Tartibli o'qish, indeks bilan tez kirish  |
| **Map / Dict**     | Mehmon yozuvlari (id orqali qidiruv) | O(1) qidiruv                              |
| **Queue (FIFO)**   | Xona xizmati buyurtmalari            | Birinchi kelgan, birinchi xizmat          |
| **Priority Queue** | Texnik xizmat so'rovlari             | Kritik so'rovlar avval, FIFO tie-break    |
| **Pub/Sub Broker** | Servislararo aloqa                   | Loose coupling, kengaytirilishi mumkin    |

---

## ✨ Asosiy Imkoniyatlar

### 🏠 Xonalar (10 ta xona · 2 qavat)

10 ta xona — har qavatda 5 ta (101-105, 201-205). Aralash turlar:
3 single, 4 double, 2 suite, 1 accessible. Har bir xona uchun real vaqtli
holat: **toza · iflos · tozalanmoqda · band · texnik xizmat**.

### 🔔 12-Soatlik Tozalash Tsikli (asosiy talab)

Tizim har 60 sekundda avtomatik tarzda toza turgan xonalarni tekshiradi.
Agar xonaning oxirgi tozalanish vaqtidan beri **12 soatdan** (sozlamadan) ko'p
o'tgan bo'lsa:

1. ✉ Tozalovchiga avtomatik bildirishnoma yuboriladi
2. 🟡 Xona "iflos" deb belgilanadi va tozalash navbatiga qo'shiladi
3. ⏱ Har bir xona kartochkasida **"tozalanganiga X kun Y soat"** va **"iflosligiga Z soat"** ko'rsatilgan
4. ✅ Tozalovchi xonani toza deb belgilaganida — "Xona tozalandi va tayyor" bildirishnomasi yuboriladi

### 💎 Premium Light Design

- **Ranglar:** krem (#FAF8F4), shampan oltini (#C9A961), tinch ko'k (#4A6FA5)
- **Shriftlar:** Inter (UI), Playfair Display (sarlavhalar), JetBrains Mono (raqamlar)
- Yumshoq soyalar, organik o'tishlar, hech qanday qattiq qora

### 🧪 8 ta Avtomatik Test Stsenariy

**Sozlamalar > Test Stsenariylari** bo'limidan har biri alohida yoki barchasi
bir vaqtning o'zida ishga tushirilishi mumkin. Hatto serverni ham ishga
tushirmasdan, `npm test` orqali to'g'ridan-to'g'ri.

| ID    | Stsenariy                                                                  |
|-------|----------------------------------------------------------------------------|
| TS-01 | Mehmon 1-qavatda ikki kishilik xona so'rab check-in qiladi                |
| TS-02 | Check-out — hisob hisoblanadi, xona iflos bo'ladi                         |
| TS-03 | Tozalovchi xonani toza deb belgilaydi (dirty → cleaning → clean)          |
| TS-04 | Xona xizmati: 2 qahva + 1 sandvich, to'liq tsikl                          |
| TS-05 | Kritik texnik xizmat — ustuvorlik navbati                                 |
| TS-06 | Ikki mehmon bir vaqtda — turli xonalarga tayinlanadi                      |
| TS-07 | Barcha xonalar band — aniq xato xabari, ishdan chiqish yo'q              |
| TS-08 | Noto'g'ri kiritish (XSS, manfiy son, bo'sh ism) — tizim barqaror qoladi  |

Hozirgi natija: **8/8 muvaffaqiyatli** ✓

### ⚙ Sozlamalar Panelida Quyidagilar Bor

- **Tozalash chastotasi** (default 12 soat, 1-72 oralig'ida sozlanadi)
- **Avtomatik tozalovchi bildirishnomasi** (on/off)
- **Xona vaqt o'lchagichini ko'rsatish** (on/off)
- **Bildirishnoma ovozi** (on/off)
- **Avtomatik yangilash interval** (2-120 sekund)
- **Til:** O'zbekcha · Русский · English
- **Mavzu (tema):** Ochiq (default), Krem
- **Zichlik (density):** Qulay, Zich
- **Panelda hodisa jurnalini ko'rsatish**
- **Valyuta:** UZS (so'm)
- **Ma'lumotlarni JSON ga eksport qilish**
- **Barcha ma'lumotlarni qayta tiklash** (faqat menejer)

---

## 🔐 Xavfsizlik

### Rolga Asoslangan Kirish Nazorati (RBAC)

Tizimda 4 ta rol. Har biri o'z bo'limining doirasida ishlaydi. Backend HAR DOIM rolni qayta tekshiradi — hatto frontend xato qilsa yoki foydalanuvchi to'g'ridan-to'g'ri API ga so'rov yuborsa ham, ruxsatsiz amal **403 Forbidden** bilan rad etiladi.

| Imkoniyat / Sahifa             | Bosh Menejer | Qabul | Tozalash | Texnik |
|--------------------------------|:---:|:---:|:---:|:---:|
| Dashboard (rolga moslashtirilgan) | ✓ | ✓ | ✓ | ✓ |
| Xonalarni ko'rish              | ✓ | ✓ | ✓ | ✓ |
| **Narxlarni ko'rish**          | ✓ | ✓ | ❌ | ❌ |
| Mehmon ro'yxati va ismlarni ko'rish | ✓ | ✓ | ❌ | ❌ |
| Check-in / Check-out qilish    | ✓ | ✓ | ❌ | ❌ |
| Buyurtma yaratish              | ✓ | ✓ | ❌ | ❌ |
| Buyurtma holatini o'zgartirish | ✓ | ✓ | ❌ | ❌ |
| Menyu va narxlarni ko'rish     | ✓ | ✓ | ❌ | ❌ |
| Tozalashni boshlash/yakunlash  | ✓ | ❌ | ✓ | ❌ |
| Tozalash navbatiga qo'shish    | ✓ | ✓ | ✓ | ❌ |
| Texnik xizmat so'rovi yuborish | ✓ | ✓ | ❌ | ✓ |
| Texnik xizmat so'rovini hal qilish | ✓ | ❌ | ❌ | ✓ |
| Daromad statistikasi           | ✓ | ❌ | ❌ | ❌ |
| Test stsenariylari ishga tushirish | ✓ | ❌ | ❌ | ❌ |
| Hodisa jurnali (broker log)    | ✓ | ✓ | ✓ | ✓ |
| Sozlamalarni ko'rish           | ✓ | ✓ | ✓ | ✓ |
| Sozlamalarni o'zgartirish      | ✓ | ❌ | ❌ | ❌ |
| Ma'lumotlarni qayta tiklash    | ✓ | ❌ | ❌ | ❌ |

**Ikki qatlam himoya:** har bir API endpoint avval `requireAuth` (token), keyin `requirePermission(perm)` (aniq harakat huquqi) tekshiradi. Ma'lumotlar darajasida — `sanitizeForRole()` funksiyasi rolga ruxsat etilmagan maydonlarni (narxlar, daromad, menyu narxlari, qo'shimcha to'lovlar) javobdan butunlay olib tashlaydi. Hatto frontend xato qilsa yoki foydalanuvchi to'g'ridan-to'g'ri `curl` orqali API ga so'rov yuborsa ham, ruxsatsiz amal **403 Forbidden** bilan rad etiladi va maxfiy ma'lumotlar uzatilmaydi.

### Boshqa xavfsizlik amallari

| Talab              | Implementation                                                          |
|--------------------|-------------------------------------------------------------------------|
| Autentifikatsiya   | Token asosida, 8 soat TTL, SHA-256 + tuz bilan shifrlangan parol        |
| Avtorizatsiya      | Rolga asoslangan, yagona huquq matritsasi (`ROLE_PERMISSIONS`)          |
| Kiritishni tekshirish | Markaziy validator (XSS, uzunlik, tur, oraliq tekshiruvi)            |
| Xato boshqaruvi    | Stek izlari oshkor etilmaydi — umumlashtirilgan xato xabarlari          |
| WebSocket xavfsizligi | Faqat tokenlashtirilgan ulanishlar + har mijoz uchun rol bo'yicha filtr |
| Login enumeration  | Yagona xato xabari (foydalanuvchi yo'q yoki parol noto'g'ri farqlanmaydi) |
| HTTP sarlavhalari  | X-Content-Type-Options, X-Frame-Options, Referrer-Policy                |
| Body chegarasi     | 32 KB (DoS himoyasi)                                                    |

---

## 📁 Fayl Tuzilishi

```
hotelos/
├─ server.js                          ← Asosiy entry point
├─ package.json                       ← Faqat express va ws
├─ README.md                          ← Bu hujjat
├─ .gitignore
├─ data.json                          ← Avtomatik (gitignored)
├─ public/                            ← Statik frontend
│  ├─ index.html
│  ├─ css/styles.css                  ← 1600+ satr, CSS o'zgaruvchilari
│  └─ js/
│     ├─ api.js                       ← REST mijoz
│     ├─ ui.js                        ← Toast, modal, WebSocket
│     ├─ pages.js                     ← Barcha sahifalar
│     └─ app.js                       ← Marshrutlash, auth, init
└─ src/                               ← Backend
   ├─ broker/messageBroker.js          ← Pub/Sub yadrosi
   ├─ services/
   │  ├─ receptionService.js
   │  ├─ housekeepingService.js
   │  ├─ roomService.js
   │  ├─ maintenanceService.js
   │  └─ notificationService.js
   ├─ algorithms/
   │  ├─ roomAssignment.js             ← 5 mezonli tanlash
   │  ├─ billing.js                    ← Hisob-kitob
   │  └─ priorityQueue.js              ← Ustuvorlik navbati
   ├─ data/
   │  ├─ store.js                      ← Davomli xotira
   │  └─ seedData.js                   ← Boshlang'ich ma'lumotlar
   ├─ api/
   │  ├─ routes.js                     ← REST endpointlar
   │  ├─ testRoutes.js                 ← Test API
   │  └─ wsServer.js                   ← WebSocket
   ├─ utils/
   │  ├─ auth.js
   │  ├─ logger.js
   │  └─ validator.js
   └─ tests/testRunner.js              ← TS-01...TS-08
```

---

## 🧠 Topshiriq Talablariga Muvofiqlik (LO1-LO4)

| Tashqi talab (BTEC)                    | Implementatsiya                                                        |
|----------------------------------------|------------------------------------------------------------------------|
| **LO1.1** Tegishli algoritm tanlash    | Xona tayinlash — 4-bosqichli filtratsiya; Tayinlash sababi qaytariladi |
| **LO1.2** Asoslangan ma'lumotlar tuzilmalari | Array, Map, Queue, PriorityQueue, Pub/Sub — har biri sababi bilan |
| **LO1.3** Murakkablik tahlili          | Hujjatda alohida bo'lim — qarang yuqoridagi jadval                     |
| **LO2.1** Mikroservis arxitekturasi    | 4 servis + broker; servislar to'g'ridan-to'g'ri bog'lanmagan          |
| **LO2.2** Real vaqtli aloqa            | WebSocket + Pub/Sub                                                    |
| **LO2.3** Holat boshqaruvi             | Davomli store, debounce-saqlash, holat mashinasi (buyurtmalar)         |
| **LO3.1** Ishlaydigan kod              | `npm install && npm start` — bitta buyruq                              |
| **LO3.2** Sinov stsenariylari          | 8 ta avtomatik test (TS-01 → TS-08), barchasi muvaffaqiyatli           |
| **LO3.3** Mehmonxonaga xos vositalar   | 12-soatlik tsikl, hisob-kitob, ustuvorlik navbati                      |
| **LO4.1** Tahlil va xatolarni tuzatish | Markaziy validator, yagona xato handler                                |
| **LO4.2** Xavfsizlik amaliyoti         | Yuqoridagi xavfsizlik jadvalini ko'ring                                |
| **LO4.3** Refactoring va sifat         | Modullar mas'uliyatlarga ajratilgan, fayllar 250 satrdan kam           |

### Hujjatlashtirish (yozma hisobot uchun)

Hisobotda alohida bo'limlarda yoritilishi kerak bo'lgan mavzular bu README da
tarqatilgan. Asosiy texnik qarorlar uchun har bir kod fayli boshida tafsilotli
izoh berilgan.

---

## 🐞 Bizdan Topilgan va Tuzatilgan Xatolar (LO4 uchun)

Loyihani qurish jarayonida quyidagi xatolar topildi va tuzatildi:

### 1. Hodisa tartibi tufayli yarish holati (race condition)

**Vaziyat:** `housekeepingService` `'guest.checked_out'` hodisasiga obuna
bo'lgan. Hodisa kechiktirilgan tarzda chaqirilganda (Promise.resolve().then),
agar boshqa servis allaqachon xonani 'clean' holatiga keltirgan bo'lsa,
ishlovchi uni qayta 'dirty' qilib qo'yardi.

**Aniqlanish:** TS-06 va TS-08 testlari muvaffaqiyatsiz bo'lar edi.

**Tuzatish:** `addToCleaningQueue` ichida xona allaqachon `clean` holatida
bo'lsa va sabab `guest_checkout` bo'lsa, hech narsa qilmaymiz. Faqat qo'lda
chaqirilgan yoki 12-soatlik tekshiruvdan kelganlar uchun kerakli o'zgarish
amalga oshiriladi.

### 2. WebSocket orqali PII (shaxsiy ma'lumot) tarqalishi

**Vaziyat:** Dastlabki versiyada to'liq mehmon ismi va to'lov ma'lumotlari
WebSocket orqali barcha ulangan mijozlarga yuborilardi.

**Tuzatish:** `wsServer.sanitizePayload` mehmon ismini bosh harflar bilan
almashtiradi va hisob tafsilotlarini olib tashlaydi.

### 3. Login enumeration urinishi

**Vaziyat:** "Foydalanuvchi topilmadi" va "Parol noto'g'ri" alohida xatolar
hujumchiga foydalanuvchilarni aniqlashga yordam berardi.

**Tuzatish:** Yagona xabar — "Foydalanuvchi nomi yoki parol noto'g'ri".

---

## 🛡 Cheklovlar va Kelajakdagi Ishlar

Bu loyiha amaliy topshiriq uchun yetarli, lekin haqiqiy ishlab chiqarish uchun
quyidagilar kerak:

1. **Ma'lumotlar bazasi:** `data.json` o'rniga PostgreSQL yoki MongoDB
2. **Brokerni ajratish:** RabbitMQ yoki Redis Pub/Sub
3. **Token boshqaruvi:** JWT + refresh token, Redis-da sessiya
4. **Parollar:** bcrypt (cost ≥ 12) — hozirgi SHA-256 demo uchun
5. **HTTPS / TLS** majburiy
6. **Audit jurnali:** kim, qachon, nima qilgan
7. **CI/CD:** GitHub Actions
8. **Konteynerlashtirish:** har bir servis uchun alohida Docker image

---

## 📜 Litsenziya

MIT — bu kod akademik maqsadlarda erkin foydalanish uchun.

---

**Shahzod Nematov · PDP University · BIT bo'limi · 2-kurs · 2026**
