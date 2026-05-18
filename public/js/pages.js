/**
 * pages.js — Sahifa renderlovchilar
 * ============================================================================
 * Har bir sahifa uchun renderPage funksiyasi mavjud. Pages.<name>(container)
 * shaklida chaqiriladi. Sahifa ichidagi hodisalar (formalar, tugmalar)
 * delegate qilinmaydi — har bir render funksiya o'z hodisalarini bog'laydi.
 * ============================================================================
 */
'use strict';

(function () {
  const { API, UI } = window.HotelOS;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = UI.escapeHtml;
  const fmtUZS = UI.formatUZS;
  const fmtDur = UI.formatDuration;
  const fmtDT = UI.formatDateTime;
  const fmtTime = UI.formatTime;

  // ===========================================================================
  // ROL VA HUQUQ YORDAMCHILARI
  // Frontend backend bilan bir xil huquq matritsasidan foydalanadi. Policy
  // login paytida olinadi va localStorage da saqlanadi. Backend HAR DOIM yana
  // qayta tekshiradi — bu yerdagi tekshiruvlar faqat UI tajribasi uchun.
  // ===========================================================================
  const policy = () => window.HotelOS.currentPolicy
    || API._auth.getPolicy()
    || { permissions: [], pages: [], canSeeFinancials: false, canSeeStaffNames: false, role: 'guest', displayName: 'Mehmon' };
  const currentUser = () => window.HotelOS.currentUser || API._auth.getUser() || { role: 'guest', username: '?', displayName: '?' };
  const can = (perm) => (policy().permissions || []).includes(perm);
  const seePrices = () => policy().canSeeFinancials === true;
  const seeGuestNames = () => policy().canSeeStaffNames !== false; // default ko'rsatamiz, faqat aniq false bo'lsa yashiramiz
  const userRole = () => currentUser().role || 'guest';

  // Narxni rol bo'yicha ko'rsatish/yashirish yordamchisi
  const priceOrHidden = (amount) => seePrices() ? fmtUZS(amount) : '<span class="text-muted">—</span>';

  // ===========================================================================
  // PAGE: DASHBOARD (rolga moslashtirilgan)
  // Har bir rol o'z bo'limiga eng dolzarb ma'lumotlarni ko'radi:
  //   manager     -> hammasini ko'radi (daromad, statistika, hodisa jurnali)
  //   reception   -> xonalar holati + mehmonlar + faol buyurtmalar
  //   housekeeping-> tozalash navbati + iflos xonalar + 12-soatlik taymerlar
  //   maintenance -> ochiq so'rovlar + ustuvorlik navbati
  // ===========================================================================
  async function dashboard(container) {
    container.innerHTML = `<div class="card"><div class="card-body">Yuklanmoqda...</div></div>`;
    let data;
    try { data = await API.dashboardSummary(); }
    catch (err) { UI.toast(err.message, { severity: 'danger', title: 'Xato' }); return; }

    const role = currentUser().role;

    if (role === 'housekeeping') {
      renderHousekeepingDashboard(container, data);
    } else if (role === 'maintenance') {
      renderMaintenanceDashboard(container, data);
    } else if (role === 'reception') {
      renderReceptionDashboard(container, data);
    } else {
      renderManagerDashboard(container, data);
    }
  }

  // -- Bosh menejer: hamma narsa, statistika, daromad, hodisalar ---------------
  function renderManagerDashboard(container, data) {
    const { rooms, summary, activeOrders, openMaintenance, cleaningQueue, guests, stats, recentEvents } = data;
    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Jami Xonalar', summary.total, 'Inventar', '🏢', 'primary')}
        ${kpiCard('Toza', summary.clean || 0, 'Mehmonlar uchun tayyor', '✓', 'success')}
        ${kpiCard('Band', summary.occupied || 0, 'Joyida', '👤', 'primary')}
        ${kpiCard('Iflos', summary.dirty || 0, 'Tozalash kerak', '⚠', 'warning')}
        ${kpiCard('Buyurtmalar', activeOrders.length, 'Hozir faol', '◇', 'info')}
        ${kpiCard('Texnik xizmat', openMaintenance.length, 'Ochiq so\'rovlar', '⚒', 'danger')}
      </div>

      ${stats.totalRevenue ? `
      <div class="kpi-grid" style="margin-top:8px">
        ${kpiCard('Jami daromad', fmtUZS(stats.totalRevenue), 'Boshlanishidan beri', '💰', 'success')}
        ${kpiCard('Check-in lar', stats.totalCheckIns || 0, 'Jami', '⊙', 'primary')}
        ${kpiCard('Check-out lar', stats.totalCheckOuts || 0, 'Jami', '↩', 'primary')}
        ${kpiCard('Buyurtmalar (jami)', stats.totalOrders || 0, 'Tarix', '∑', 'info')}
      </div>` : ''}

      <div class="dashboard-grid">
        ${roomsCard(rooms, summary)}
        ${ordersCard(activeOrders)}
        ${maintenanceCard(openMaintenance)}
        ${cleaningCard(cleaningQueue)}
        ${guestsCard(guests)}
        ${eventsCard(recentEvents)}
      </div>
    `;
  }

  // -- Qabul xodimi: xonalar, mehmonlar, buyurtmalar --------------------------
  function renderReceptionDashboard(container, data) {
    const { rooms, summary, activeOrders, openMaintenance, guests } = data;
    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Jami xonalar', summary.total, 'Inventar', '🏢', 'primary')}
        ${kpiCard('Toza & bo\'sh', summary.clean || 0, 'Yangi mehmonlar uchun', '✓', 'success')}
        ${kpiCard('Band', summary.occupied || 0, 'Joriy mehmonlar', '👤', 'primary')}
        ${kpiCard('Faol buyurtmalar', activeOrders.length, 'Xona xizmati', '◇', 'info')}
      </div>

      <div class="dashboard-grid">
        ${roomsCard(rooms, summary)}
        ${guestsCard(guests)}
        ${ordersCard(activeOrders)}
        ${maintenanceCard(openMaintenance, 'Texnik xizmat so\'rovlari')}
      </div>
    `;
  }

  // -- Tozalash xodimi: faqat tozalash bilan bog'liq -------------------------
  function renderHousekeepingDashboard(container, data) {
    const { rooms, summary, cleaningQueue } = data;
    const dirtyRooms = rooms.filter((r) => r.status === 'dirty');
    const cleaningRooms = rooms.filter((r) => r.status === 'cleaning');
    const cleanRooms = rooms.filter((r) => r.status === 'clean');
    const dueSoon = cleanRooms.filter((r) => r.lastCleanedAt && (Date.now() - r.lastCleanedAt) > 10 * 3600000).length;

    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Tozalash navbati', cleaningQueue.length, '12 soatlik tsikl', '✦', 'warning')}
        ${kpiCard('Iflos xonalar', dirtyRooms.length, 'Tezroq tozalansin', '⚠', 'warning')}
        ${kpiCard('Tozalanmoqda', cleaningRooms.length, 'Jarayonda', '✦', 'info')}
        ${kpiCard('Yaqin orada', dueSoon, '10+ soat o\'tdi', '⏱', 'warning')}
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">⚠</span> Iflos Xonalar — Darhol Tozalansin</h3>
            <span class="text-muted text-sm">${dirtyRooms.length} ta</span>
          </div>
          <div class="card-body">
            ${dirtyRooms.length === 0
              ? `<div class="table-empty">Ajoyib! Iflos xonalar yo'q ✓</div>`
              : dirtyRooms.map((r) => `
                <div class="order-row">
                  <div class="order-info">
                    <div class="order-title">Xona ${r.number} — ${UI.ROOM_TYPE_LABELS[r.type]}</div>
                    <div class="order-items-summary">
                      ${r.dirtyAt ? `Iflosligiga: <b>${fmtDur(Date.now() - r.dirtyAt)}</b>` : ''}
                    </div>
                  </div>
                  <div class="order-actions">
                    <button class="btn btn-primary btn-sm" data-quick-start="${r.number}">▶ Tozalashni boshlash</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        ${cleaningCard(cleaningQueue, 'Navbat')}

        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">🏢</span> Xonalar Holati</h3>
          </div>
          <div class="card-body">
            <div class="room-grid">${rooms.map(roomCard).join('')}</div>
          </div>
        </div>
      </div>
    `;

    // Tezkor tugma — to'g'ridan-to'g'ri tozalashni boshlash
    $$('[data-quick-start]', container).forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.startCleaning(parseInt(b.dataset.quickStart, 10));
        UI.toast(`Xona ${b.dataset.quickStart} tozalanmoqda`, { severity: 'info' });
        dashboard(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    }));
  }

  // -- Texnik xodim: faqat texnik so'rovlar ----------------------------------
  function renderMaintenanceDashboard(container, data) {
    const { rooms, openMaintenance } = data;
    const critical = openMaintenance.filter((r) => r.urgency === 'critical').length;
    const high = openMaintenance.filter((r) => r.urgency === 'high').length;

    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Ochiq so\'rovlar', openMaintenance.length, 'Hal qilinishi kerak', '⚒', 'warning')}
        ${kpiCard('Kritik', critical, 'Darhol e\'tibor!', '!', 'danger')}
        ${kpiCard('Yuqori', high, 'Birinchi navbatda', '↑', 'warning')}
        ${kpiCard('Jami xonalar', rooms.length, 'Inventar', '🏢', 'primary')}
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">⚒</span> Sizning Ustuvorlik Navbatingiz</h3>
            <span class="text-muted text-sm">Kritik birinchi · keyin FIFO</span>
          </div>
          <div class="card-body">
            ${openMaintenance.length === 0
              ? `<div class="table-empty">Ochiq so'rovlar yo'q — ajoyib ish! ✓</div>`
              : openMaintenance.map((r, i) => `
                <div class="order-row">
                  <div class="order-info">
                    <div class="order-title">#${i + 1} · Xona ${r.roomNumber} — ${esc(r.category)}</div>
                    <div class="order-items-summary">${esc(r.description)}</div>
                    <div class="text-sm text-muted">${fmtDur(Date.now() - r.submittedAt)} oldin</div>
                  </div>
                  <div class="order-actions">
                    ${UI.priorityPill(r.urgency)}
                    <button class="btn btn-success btn-sm" data-quick-resolve="${r.id}">✓ Hal qilindi</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">🏢</span> Xonalar Holati</h3>
          </div>
          <div class="card-body">
            <div class="room-grid">${rooms.map(roomCard).join('')}</div>
          </div>
        </div>
      </div>
    `;

    $$('[data-quick-resolve]', container).forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.resolveMaintenance(b.dataset.quickResolve, 'Texnik tomonidan hal qilindi');
        UI.toast('Hal qilindi ✓', { severity: 'success' });
        dashboard(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    }));
  }

  // -- Yordamchi kartochkalar (qayta ishlatiladi) -----------------------------
  function roomsCard(rooms, summary) {
    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">🏢</span> Xonalar Holati</h3>
          <span class="text-muted text-sm">${summary.total} xona / 2 qavat</span>
        </div>
        <div class="card-body">
          <div class="room-grid">${rooms.map(roomCard).join('')}</div>
        </div>
      </div>
    `;
  }
  function ordersCard(activeOrders) {
    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">◇</span> Faol Buyurtmalar</h3>
          <span class="text-muted text-sm">${activeOrders.length} ta</span>
        </div>
        <div class="card-body">
          ${activeOrders.length === 0
            ? `<div class="table-empty">Hozircha faol buyurtmalar yo'q</div>`
            : activeOrders.slice(0, 5).map(orderRow).join('')}
        </div>
      </div>
    `;
  }
  function maintenanceCard(openMaintenance, title = 'Texnik Xizmat Navbati') {
    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">⚒</span> ${esc(title)}</h3>
          <span class="text-muted text-sm">${openMaintenance.length} ochiq</span>
        </div>
        <div class="card-body">
          ${openMaintenance.length === 0
            ? `<div class="table-empty">Ochiq texnik xizmat so'rovi yo'q</div>`
            : openMaintenance.slice(0, 5).map(maintRow).join('')}
        </div>
      </div>
    `;
  }
  function cleaningCard(cleaningQueue, title = 'Tozalash Navbati') {
    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">✦</span> ${esc(title)}</h3>
          <span class="text-muted text-sm">${cleaningQueue.length} ta</span>
        </div>
        <div class="card-body">
          ${cleaningQueue.length === 0
            ? `<div class="table-empty">Tozalash navbati bo'sh</div>`
            : cleaningQueue.map((q) => `
              <div class="order-row">
                <div class="order-info">
                  <div class="order-id">Xona ${q.roomNumber}</div>
                  <div class="order-items-summary">Sabab: ${esc(q.reason || 'manual')} · ${fmtDur(Date.now() - q.addedAt)} oldin qo'shildi</div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }
  function guestsCard(guests) {
    const nameCol = seeGuestNames() ? 'Mehmon' : 'Mehmon (anonim)';
    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">👥</span> Hozirgi Mehmonlar</h3>
          <span class="text-muted text-sm">${guests.length} mehmon</span>
        </div>
        <div class="card-body">
          ${guests.length === 0
            ? `<div class="table-empty">Hozirgi mehmonlar yo'q</div>`
            : `<table class="table"><thead><tr><th>${nameCol}</th><th>Xona</th><th>Check-in</th><th>Tunlar</th></tr></thead><tbody>
              ${guests.map((g) => `
                <tr>
                  <td><span class="font-semibold">${esc(g.name || g.initials || '—')}</span></td>
                  <td><span class="font-mono">${g.roomNumber}</span></td>
                  <td class="text-sm">${fmtDT(g.checkInAt)}</td>
                  <td>${g.nights}</td>
                </tr>
              `).join('')}
              </tbody></table>`}
        </div>
      </div>
    `;
  }
  function eventsCard(recentEvents) {
    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">⌬</span> So'nggi Hodisalar</h3>
          <span class="text-muted text-sm">jonli</span>
        </div>
        <div class="card-body">
          <div class="event-log">
            ${recentEvents.length === 0
              ? `<div class="text-muted text-sm">Hodisalar yo'q</div>`
              : recentEvents.slice(0, 12).map(eventEntry).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function kpiCard(label, value, delta, icon, tone = 'primary') {
    return `
      <div class="kpi">
        <div class="kpi-icon ${tone}">${icon}</div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-delta">${esc(delta)}</div>
      </div>
    `;
  }

  function roomCard(room) {
    const now = Date.now();
    let timerHtml = '';
    if (room.status === 'clean' && room.lastCleanedAt) {
      const elapsed = now - room.lastCleanedAt;
      const cls = elapsed > 12 * 3600000 ? 'warning-timer' : 'clean-timer';
      timerHtml = `<div class="timer-ribbon ${cls}"><span>Tozalanganiga:</span><span>${fmtDur(elapsed)}</span></div>`;
    } else if (room.status === 'dirty' && room.dirtyAt) {
      const elapsed = now - room.dirtyAt;
      timerHtml = `<div class="timer-ribbon dirty-timer"><span>Iflosligiga:</span><span>${fmtDur(elapsed)}</span></div>`;
    } else if (room.status === 'occupied' && room.occupiedAt) {
      const elapsed = now - room.occupiedAt;
      timerHtml = `<div class="timer-ribbon clean-timer"><span>Band:</span><span>${fmtDur(elapsed)}</span></div>`;
    } else if (room.status === 'cleaning' && room.cleaningStartedAt) {
      const elapsed = now - room.cleaningStartedAt;
      timerHtml = `<div class="timer-ribbon dirty-timer"><span>Tozalanmoqda:</span><span>${fmtDur(elapsed)}</span></div>`;
    }

    // Narx — faqat ko'rish ruxsati bor rollarda ko'rsatiladi
    const priceRow = (seePrices() && room.nightlyRate)
      ? `<div class="room-meta">
           <span class="room-meta-label">Narx:</span>
           <span class="font-mono">${fmtUZS(room.nightlyRate)}/tun</span>
         </div>`
      : '';

    return `
      <div class="room-card" data-room="${room.number}">
        <div class="room-card-header">
          <div>
            <div class="room-number">${room.number}</div>
            <div class="room-floor">${room.floor}-qavat · ${UI.ROOM_TYPE_LABELS[room.type] || room.type}</div>
          </div>
          ${UI.statusPill(room.status)}
        </div>
        ${priceRow}
        ${timerHtml}
      </div>
    `;
  }

  function orderRow(o) {
    const itemsSummary = o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
    const title = seePrices() && o.total != null
      ? `Xona ${o.roomNumber} — ${fmtUZS(o.total)}`
      : `Xona ${o.roomNumber}`;
    return `
      <div class="order-row">
        <div class="order-info">
          <div class="order-title">${title}</div>
          <div class="order-id">${o.id.slice(0, 18)}…</div>
          <div class="order-items-summary">${esc(itemsSummary)}</div>
        </div>
        <div class="order-actions">
          ${UI.orderStatusPill(o.status)}
        </div>
      </div>
    `;
  }

  function maintRow(r) {
    return `
      <div class="order-row">
        <div class="order-info">
          <div class="order-title">Xona ${r.roomNumber} — ${esc(r.category)}</div>
          <div class="order-items-summary">${esc(r.description)}</div>
        </div>
        <div class="order-actions">
          ${UI.priorityPill(r.urgency)}
        </div>
      </div>
    `;
  }

  function eventEntry(e) {
    return `
      <div class="event-entry">
        <span class="event-time">${fmtTime(new Date(e.publishedAt).getTime())}</span>
        <span class="event-topic"> ${esc(e.topic)}</span>
        ${e.payload?.roomNumber ? `<span class="event-publisher"> xona ${e.payload.roomNumber}</span>` : ''}
        ${e.payload?.message ? `<span> — ${esc(e.payload.message)}</span>` : ''}
      </div>
    `;
  }

  // ===========================================================================
  // PAGE: ROOMS (detailed table)
  // ===========================================================================
  async function rooms(container) {
    let data;
    try { data = await API.inventory(); }
    catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }
    const { rooms, summary } = data;
    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Toza', summary.clean || 0, 'Tayyor', '✓', 'success')}
        ${kpiCard('Band', summary.occupied || 0, 'Mehmonda', '👤', 'primary')}
        ${kpiCard('Iflos', summary.dirty || 0, 'Tozalanishi kerak', '⚠', 'warning')}
        ${kpiCard('Tozalanmoqda', summary.cleaning || 0, 'Jarayonda', '✦', 'info')}
      </div>
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Barcha Xonalar (${rooms.length})</h3>
        </div>
        <div class="card-body">
          <div class="room-grid">
            ${rooms.map(roomCard).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // PAGE: RECEPTION (check-in / check-out)
  // ===========================================================================
  async function reception(container) {
    let inv;
    try { inv = await API.inventory(); }
    catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }

    container.innerHTML = `
      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">⊙</span> Yangi Check-in</h3>
          </div>
          <div class="card-body">
            <form id="checkin-form">
              <div class="form-group">
                <label class="form-label">Mehmon ismi *</label>
                <input class="form-input" name="guestName" required placeholder="Masalan: Bobur Toshmatov" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Xona turi *</label>
                  <select class="form-select" name="roomType" required>
                    <option value="single">Single (1 kishi)</option>
                    <option value="double" selected>Double (2 kishi)</option>
                    <option value="suite">Suite (Lyuks)</option>
                    <option value="accessible">Accessible (Imkoniyatli)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Tunlar soni *</label>
                  <input class="form-input" name="nights" type="number" min="1" max="90" value="2" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Qavat afzalligi (ixtiyoriy)</label>
                  <select class="form-select" name="floorPreference">
                    <option value="">Farqsiz</option>
                    <option value="1">1-qavat</option>
                    <option value="2">2-qavat</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Yaqinlik afzalligi</label>
                  <select class="form-select" name="proximityPreference">
                    <option value="none">Farqsiz</option>
                    <option value="near_elevator">Liftga yaqin</option>
                    <option value="near_stairs">Zinapoyaga yaqin</option>
                  </select>
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-block">Check-in qilish</button>
              <div id="checkin-result"></div>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">👥</span> Joriy Mehmonlar</h3>
          </div>
          <div class="card-body">
            <div id="current-guests-list"></div>
          </div>
        </div>
      </div>
    `;

    // Joriy mehmonlar ro'yxati
    await renderCurrentGuests();

    $('#checkin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      const data = {
        guestName: fd.get('guestName').trim(),
        roomType: fd.get('roomType'),
        nights: parseInt(fd.get('nights'), 10),
      };
      if (fd.get('floorPreference')) data.floorPreference = parseInt(fd.get('floorPreference'), 10);
      if (fd.get('proximityPreference')) data.proximityPreference = fd.get('proximityPreference');

      try {
        const res = await API.checkIn(data);
        $('#checkin-result').innerHTML = `
          <div class="assignment-result">
            <div class="assignment-result-room">Xona ${res.room.number}</div>
            <div class="text-sm"><b>${esc(res.guest.name)}</b> ushbu xonaga joylashtirildi</div>
            <div class="text-sm text-muted" style="margin-top:6px">${esc(res.assignmentReason)}</div>
          </div>
        `;
        form.reset();
        UI.toast(`${res.guest.name} → Xona ${res.room.number}`, { severity: 'success', title: 'Check-in muvaffaqiyatli' });
        await renderCurrentGuests();
      } catch (err) {
        UI.toast(err.message, { severity: 'danger', title: 'Check-in muvaffaqiyatsiz' });
      }
    });

    async function renderCurrentGuests() {
      try {
        const data2 = await API.dashboardSummary();
        const guests = data2.guests;
        const container = $('#current-guests-list');
        if (guests.length === 0) {
          container.innerHTML = `<div class="table-empty">Hozircha mehmonlar yo'q</div>`;
          return;
        }
        container.innerHTML = `
          <table class="table">
            <thead><tr><th>Mehmon</th><th>Xona</th><th>Check-in</th><th>Tunlar</th><th></th></tr></thead>
            <tbody>
              ${guests.map((g) => `
                <tr>
                  <td><span class="font-semibold">${esc(g.name || g.initials || '—')}</span></td>
                  <td><span class="font-mono">${g.roomNumber}</span></td>
                  <td class="text-sm">${fmtDT(g.checkInAt)}</td>
                  <td>${g.nights}</td>
                  <td><button class="btn btn-ghost btn-sm" data-checkout="${g.roomNumber}">Check-out</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        $$('[data-checkout]', container).forEach((btn) => {
          btn.addEventListener('click', async () => {
            const rn = parseInt(btn.dataset.checkout, 10);
            try {
              const res = await API.checkOut(rn);
              showBillModal(res.bill);
              await renderCurrentGuests();
            } catch (err) {
              UI.toast(err.message, { severity: 'danger' });
            }
          });
        });
      } catch (_) {}
    }
  }

  function showBillModal(bill) {
    const itemsHtml = bill.orders.length
      ? bill.orders.map((o) => `
          <div class="bill-row"><span>Buyurtma ${o.id.slice(-6)}</span><span class="font-mono">${fmtUZS(o.total)}</span></div>
        `).join('')
      : `<div class="bill-row text-muted"><span>Buyurtmalar yo'q</span><span class="font-mono">${fmtUZS(0)}</span></div>`;

    UI.openModal({
      title: `Check-out: ${esc(bill.guestName)} — Xona ${bill.roomNumber}`,
      bodyHtml: `
        <div class="bill-card">
          <div class="bill-row"><span>Xona narxi (${bill.nights} tun × ${fmtUZS(bill.nightlyRate)})</span><span class="font-mono">${fmtUZS(bill.roomCharge)}</span></div>
          ${itemsHtml}
          <div class="bill-row"><span>Qo'shimcha to'lovlar</span><span class="font-mono">${fmtUZS(bill.extraCharges)}</span></div>
          ${bill.discountAmount ? `<div class="bill-row text-success"><span>Chegirma</span><span class="font-mono">-${fmtUZS(bill.discountAmount)}</span></div>` : ''}
          <div class="bill-row total"><span>JAMI</span><span class="font-mono">${fmtUZS(bill.total)}</span></div>
        </div>
        <div class="text-muted text-sm" style="margin-top:14px">Check-in: ${fmtDT(bill.checkInAt)}<br>Check-out: ${fmtDT(bill.checkOutAt)}</div>
      `,
      footerHtml: `<button class="btn btn-primary" onclick="window.HotelOS.UI.closeModal()">Yopish</button>`,
    });
  }

  // ===========================================================================
  // PAGE: HOUSEKEEPING
  // ===========================================================================
  async function housekeeping(container) {
    container.innerHTML = `<div class="card"><div class="card-body">Yuklanmoqda...</div></div>`;
    let data;
    try {
      const [inv, q] = await Promise.all([API.inventory(), API.housekeepingQueue()]);
      data = { rooms: inv.rooms, summary: inv.summary, queue: q.queue };
    } catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }

    const dirtyRooms = data.rooms.filter((r) => r.status === 'dirty');
    const cleaningRooms = data.rooms.filter((r) => r.status === 'cleaning');

    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Tozalash navbati', data.queue.length, '12 soatlik tsikl', '✦', 'warning')}
        ${kpiCard('Iflos', dirtyRooms.length, 'Tezda tozalansin', '⚠', 'warning')}
        ${kpiCard('Tozalanmoqda', cleaningRooms.length, 'Jarayonda', '✦', 'info')}
        ${kpiCard('Toza', data.summary.clean || 0, 'Tayyor', '✓', 'success')}
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Tozalash kerak (Iflos xonalar)</h3>
          </div>
          <div class="card-body">
            ${dirtyRooms.length === 0
              ? `<div class="table-empty">Iflos xonalar yo'q</div>`
              : dirtyRooms.map((r) => `
                <div class="order-row">
                  <div class="order-info">
                    <div class="order-title">Xona ${r.number} — ${UI.ROOM_TYPE_LABELS[r.type]}</div>
                    <div class="order-items-summary">
                      ${r.dirtyAt ? `Iflosligiga: ${fmtDur(Date.now() - r.dirtyAt)}` : ''}
                      ${r.lastCleanedAt ? ` · Oxirgi tozalash: ${fmtDur(Date.now() - r.lastCleanedAt)} oldin` : ''}
                    </div>
                  </div>
                  <div class="order-actions">
                    <button class="btn btn-secondary btn-sm" data-start="${r.number}">Tozalashni boshlash</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Hozir tozalanmoqda</h3>
          </div>
          <div class="card-body">
            ${cleaningRooms.length === 0
              ? `<div class="table-empty">Hozir hech narsa tozalanmayapti</div>`
              : cleaningRooms.map((r) => `
                <div class="order-row">
                  <div class="order-info">
                    <div class="order-title">Xona ${r.number}</div>
                    <div class="order-items-summary">${r.cleaningStartedAt ? `Boshlanganiga: ${fmtDur(Date.now() - r.cleaningStartedAt)}` : ''}</div>
                  </div>
                  <div class="order-actions">
                    <button class="btn btn-success btn-sm" data-complete="${r.number}">Toza deb belgilash</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Toza xonalar ↻ tozalash vaqti</h3>
            <span class="text-muted text-sm">12 soat ortib ketganlar avtomatik ravishda eslatma oladi</span>
          </div>
          <div class="card-body">
            <div class="room-grid">
              ${data.rooms.filter((r) => r.status === 'clean' || r.status === 'occupied').map(roomCard).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    $$('[data-start]', container).forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.startCleaning(parseInt(b.dataset.start, 10));
        UI.toast(`Xona ${b.dataset.start} tozalanmoqda`, { severity: 'info' });
        housekeeping(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    }));
    $$('[data-complete]', container).forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.completeCleaning(parseInt(b.dataset.complete, 10));
        UI.toast(`Xona ${b.dataset.complete} TOZA`, { severity: 'success' });
        housekeeping(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    }));
  }

  // ===========================================================================
  // PAGE: ORDERS (Room Service)
  // ===========================================================================
  async function orders(container) {
    let data, menu, sum;
    try {
      const [allOrders, menuData, summary] = await Promise.all([API.orders(), API.menu(), API.dashboardSummary()]);
      data = allOrders.orders; menu = menuData.menu; sum = summary;
    } catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }

    const occupiedRooms = sum.rooms.filter((r) => r.status === 'occupied');
    const activeOrders = data.filter((o) => !['delivered', 'cancelled'].includes(o.status));
    const completedOrders = data.filter((o) => ['delivered', 'cancelled'].includes(o.status));

    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Faol Buyurtmalar', activeOrders.length, 'Jarayonda', '◇', 'primary')}
        ${kpiCard('Bugun yetkazildi', completedOrders.filter((o) => o.status === 'delivered').length, 'Muvaffaqiyatli', '✓', 'success')}
        ${kpiCard('Jami buyurtmalar', data.length, 'Tarix', '∑', 'info')}
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Yangi Buyurtma</h3>
          </div>
          <div class="card-body">
            ${occupiedRooms.length === 0
              ? `<div class="table-empty">Band xonalar yo'q — avval mehmon kiriting</div>`
              : `
                <form id="order-form">
                  <div class="form-group">
                    <label class="form-label">Xona</label>
                    <select class="form-select" name="roomNumber" required>
                      ${occupiedRooms.map((r) => `<option value="${r.number}">Xona ${r.number} (${UI.ROOM_TYPE_LABELS[r.type]})</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Menyu — miqdorni tanlang</label>
                    <div class="menu-grid" id="menu-grid">
                      ${menu.map((m) => `
                        <label class="menu-item-row">
                          <div>
                            <div class="menu-item-name">${esc(m.name)}</div>
                            <div class="menu-item-price">${fmtUZS(m.price)}</div>
                          </div>
                          <input class="qty-input" type="number" min="0" max="20" value="0" data-item="${m.id}">
                        </label>
                      `).join('')}
                    </div>
                  </div>
                  <button type="submit" class="btn btn-primary btn-block">Buyurtma yaratish</button>
                </form>
              `}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Faol Buyurtmalar (${activeOrders.length})</h3>
          </div>
          <div class="card-body">
            ${activeOrders.length === 0
              ? `<div class="table-empty">Faol buyurtmalar yo'q</div>`
              : activeOrders.map((o) => `
                <div class="order-row">
                  <div class="order-info">
                    <div class="order-title">Xona ${o.roomNumber} — ${fmtUZS(o.total)}</div>
                    <div class="order-id">${o.id}</div>
                    <div class="order-items-summary">${esc(o.items.map((i) => `${i.quantity}× ${i.name}`).join(', '))}</div>
                  </div>
                  <div class="order-actions">
                    ${UI.orderStatusPill(o.status)}
                    <button class="btn btn-primary btn-sm" data-advance="${o.id}">Keyingi bosqich →</button>
                    <button class="btn btn-ghost btn-sm" data-cancel="${o.id}">Bekor qilish</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Tarix (oxirgi ${Math.min(completedOrders.length, 20)})</h3>
          </div>
          <div class="card-body">
            ${completedOrders.length === 0
              ? `<div class="table-empty">Hali tarix yo'q</div>`
              : `<table class="table"><thead><tr><th>Xona</th><th>Mahsulotlar</th><th>Jami</th><th>Holat</th><th>Vaqt</th></tr></thead><tbody>
                ${completedOrders.slice(0, 20).map((o) => `
                  <tr>
                    <td class="font-mono">${o.roomNumber}</td>
                    <td class="text-sm">${esc(o.items.map((i) => `${i.quantity}× ${i.name}`).join(', '))}</td>
                    <td class="font-mono">${fmtUZS(o.total)}</td>
                    <td>${UI.orderStatusPill(o.status)}</td>
                    <td class="text-sm">${fmtTime(o.deliveredAt || o.cancelledAt || o.createdAt)}</td>
                  </tr>
                `).join('')}
                </tbody></table>`}
          </div>
        </div>
      </div>
    `;

    const form = $('#order-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const roomNumber = parseInt(fd.get('roomNumber'), 10);
        const items = $$('[data-item]', form)
          .map((inp) => ({ itemId: inp.dataset.item, quantity: parseInt(inp.value, 10) || 0 }))
          .filter((it) => it.quantity > 0);
        if (items.length === 0) {
          UI.toast('Kamida bitta mahsulot tanlang', { severity: 'warning' });
          return;
        }
        try {
          const res = await API.createOrder({ roomNumber, items });
          UI.toast(`Buyurtma yaratildi: ${fmtUZS(res.order.total)}`, { severity: 'success' });
          orders(container);
        } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
      });
    }

    $$('[data-advance]', container).forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.advanceOrder(b.dataset.advance);
        UI.toast('Bosqich oldinga siljidi', { severity: 'info' });
        orders(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    }));
    $$('[data-cancel]', container).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Bekor qilishga ishonchingiz komilmi?')) return;
      try {
        await API.cancelOrder(b.dataset.cancel);
        UI.toast('Buyurtma bekor qilindi', { severity: 'warning' });
        orders(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    }));
  }

  // ===========================================================================
  // PAGE: MAINTENANCE
  // ===========================================================================
  async function maintenance(container) {
    let data;
    try {
      const [all, queue] = await Promise.all([API.maintenance(), API.maintenanceQueue()]);
      data = { all: all.requests, queue: queue.queue };
    } catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }

    const openReqs = data.queue;
    const resolvedReqs = data.all.filter((r) => r.status === 'resolved');

    container.innerHTML = `
      <div class="kpi-grid">
        ${kpiCard('Ochiq', openReqs.length, 'Hal qilinishi kerak', '⚒', 'warning')}
        ${kpiCard('Kritik', openReqs.filter((r) => r.urgency === 'critical').length, 'Darhol', '!', 'danger')}
        ${kpiCard('Hal qilindi', resolvedReqs.length, 'Tugatilgan', '✓', 'success')}
        ${kpiCard('Jami', data.all.length, 'Tarix', '∑', 'info')}
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Yangi Texnik Xizmat So'rovi</h3>
          </div>
          <div class="card-body">
            <form id="maint-form">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Xona raqami *</label>
                  <input class="form-input" name="roomNumber" type="number" min="101" max="299" placeholder="103" required />
                  <div class="form-hint">Mavjud xonalar: 101-105, 201-205</div>
                </div>
                <div class="form-group">
                  <label class="form-label">Shoshilinchlik *</label>
                  <select class="form-select" name="urgency" required>
                    <option value="critical">🔴 Kritik (darhol)</option>
                    <option value="high">🟠 Yuqori</option>
                    <option value="normal" selected>🟡 Normal</option>
                    <option value="low">🟢 Past</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Kategoriya *</label>
                <select class="form-select" name="category" required>
                  <option value="plumbing">Sanitariya / Suv</option>
                  <option value="electrical">Elektr</option>
                  <option value="hvac">Konditsioner / Isitish</option>
                  <option value="furniture">Mebel</option>
                  <option value="appliance">Texnika</option>
                  <option value="other">Boshqa</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Tavsif *</label>
                <textarea class="form-textarea" name="description" required placeholder="Muammoni batafsil tasvirlang..."></textarea>
              </div>
              <button type="submit" class="btn btn-primary btn-block">So'rov yuborish</button>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Ustuvorlik Navbati</h3>
            <span class="text-muted text-sm">Kritik birinchi · keyin FIFO</span>
          </div>
          <div class="card-body">
            ${openReqs.length === 0
              ? `<div class="table-empty">Ochiq so'rovlar yo'q ✓</div>`
              : openReqs.map((r, i) => `
                <div class="order-row">
                  <div class="order-info">
                    <div class="order-title">#${i + 1} · Xona ${r.roomNumber} — ${esc(r.category)}</div>
                    <div class="order-items-summary">${esc(r.description)}</div>
                    <div class="text-sm text-muted">
                      ${r.assignedToName ? `Tayinlandi: ${esc(r.assignedToName)} · ` : ''}
                      ${fmtDur(Date.now() - r.submittedAt)} oldin
                    </div>
                  </div>
                  <div class="order-actions">
                    ${UI.priorityPill(r.urgency)}
                    <button class="btn btn-success btn-sm" data-resolve="${r.id}">Hal qilindi</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Tarix (oxirgi ${Math.min(resolvedReqs.length, 20)})</h3>
          </div>
          <div class="card-body">
            ${resolvedReqs.length === 0
              ? `<div class="table-empty">Tarix yo'q</div>`
              : `<table class="table"><thead><tr><th>Xona</th><th>Tavsif</th><th>Shoshilinchlik</th><th>Hal qilindi</th></tr></thead><tbody>
                ${resolvedReqs.slice(0, 20).map((r) => `
                  <tr>
                    <td class="font-mono">${r.roomNumber}</td>
                    <td class="text-sm">${esc(r.description.slice(0, 50))}${r.description.length > 50 ? '…' : ''}</td>
                    <td>${UI.priorityPill(r.urgency)}</td>
                    <td class="text-sm">${fmtTime(r.resolvedAt)}</td>
                  </tr>
                `).join('')}
                </tbody></table>`}
          </div>
        </div>
      </div>
    `;

    $('#maint-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await API.reportMaintenance({
          roomNumber: parseInt(fd.get('roomNumber'), 10),
          urgency: fd.get('urgency'),
          category: fd.get('category'),
          description: fd.get('description').trim(),
        });
        UI.toast('So\'rov navbatga qo\'shildi', { severity: 'success' });
        maintenance(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    });
    $$('[data-resolve]', container).forEach((b) => b.addEventListener('click', async () => {
      try {
        await API.resolveMaintenance(b.dataset.resolve, 'Texnik tomonidan hal qilindi');
        UI.toast('Hal qilindi ✓', { severity: 'success' });
        maintenance(container);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    }));
  }

  // ===========================================================================
  // PAGE: TESTS
  // ===========================================================================
  async function tests(container) {
    let list;
    try { list = (await API.listTests()).scenarios; }
    catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Test Stsenariylari (TS-01 → TS-08)</h3>
          <div class="page-actions">
            <button class="btn btn-primary" id="run-all-btn">▶ Barchasini ishga tushirish</button>
          </div>
        </div>
        <div class="card-body">
          <p class="text-muted text-sm" style="margin-bottom:18px">
            Topshiriqning Vazifa 3 (LO3) talabiga muvofiq bo'lgan 8 ta test stsenariy. Har biri
            yagona stsenariy — precondition → act → assert → cleanup tsiklini bajaradi.
          </p>
          <div id="test-list">
            ${list.map(testCard).join('')}
          </div>
        </div>
      </div>
    `;

    $('#run-all-btn').addEventListener('click', async () => {
      const btn = $('#run-all-btn');
      btn.disabled = true; btn.textContent = '⏳ Ishlamoqda...';
      try {
        const res = await API.runAllTests();
        for (const r of res.results) {
          updateTestCard(r);
        }
        UI.toast(`${res.summary.passed}/${res.summary.total} muvaffaqiyatli`, {
          severity: res.summary.failed === 0 ? 'success' : 'warning',
          title: 'Test natijalari',
        });
      } catch (err) {
        UI.toast(err.message, { severity: 'danger' });
      } finally {
        btn.disabled = false; btn.textContent = '▶ Barchasini ishga tushirish';
      }
    });

    $$('[data-run]', container).forEach((b) => b.addEventListener('click', async () => {
      const id = b.dataset.run;
      b.disabled = true; b.textContent = '⏳';
      try {
        const r = await API.runTest(id);
        updateTestCard(r);
      } catch (err) {
        UI.toast(err.message, { severity: 'danger' });
      } finally {
        b.disabled = false; b.textContent = '▶ Ishga tushirish';
      }
    }));
  }

  function testCard(s) {
    return `
      <div class="scenario-card" id="scenario-${s.id}">
        <div class="scenario-header">
          <div>
            <div class="scenario-id">${s.id}</div>
            <div class="scenario-title">${esc(s.title)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" data-run="${s.id}">▶ Ishga tushirish</button>
        </div>
        <div class="scenario-description">${esc(s.description)}</div>
        <div class="scenario-result" data-result="${s.id}"></div>
      </div>
    `;
  }

  function updateTestCard(result) {
    const card = document.getElementById(`scenario-${result.id}`);
    if (!card) return;
    const resultEl = card.querySelector(`[data-result]`);
    const badge = result.passed
      ? `<span class="scenario-result-badge passed">✓ MUVAFFAQIYATLI</span>`
      : `<span class="scenario-result-badge failed">✗ MUVAFFAQIYATSIZ</span>`;
    resultEl.innerHTML = `
      <div class="scenario-expected">
        ${badge}
        <span class="text-sm text-muted">${result.elapsedMs} ms</span>
      </div>
      <div class="scenario-log">
        <span class="scenario-log-line">→ ${esc(result.message)}</span>
        ${result.details ? `<span class="scenario-log-line text-muted">${esc(JSON.stringify(result.details).slice(0, 200))}</span>` : ''}
      </div>
    `;
  }

  // ===========================================================================
  // PAGE: EVENTS (Broker live log)
  // ===========================================================================
  async function events(container) {
    let list;
    try { list = (await API.recentEvents(100)).events; }
    catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Xabar Brokeri Hodisa Jurnali</h3>
          <div class="page-actions">
            <button class="btn btn-ghost btn-sm" id="refresh-events">↻ Yangilash</button>
          </div>
        </div>
        <div class="card-body">
          <p class="text-muted text-sm" style="margin-bottom:14px">
            Bu jurnal mikroservislar o'rtasidagi barcha xabarlarni ko'rsatadi.
            Har bir servis brokerga "publish" qiladi va boshqa servislar obuna bo'ladi.
          </p>
          <div class="event-log" id="event-log">
            ${list.length === 0
              ? `<div class="text-muted text-sm">Hodisalar yo'q</div>`
              : list.map(eventEntry).join('')}
          </div>
        </div>
      </div>
    `;
    $('#refresh-events').addEventListener('click', () => events(container));
  }

  // ===========================================================================
  // PAGE: ARCHITECTURE
  // ===========================================================================
  function architecture(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Tizim Arxitekturasi</h3>
        </div>
        <div class="card-body">
          <div class="arch-canvas">
            <div class="arch-row">
              <div class="arch-node frontend">
                <div class="arch-node-title">🌐 Web Mijoz</div>
                <div class="arch-node-sub">Vanilla JS · WebSocket</div>
              </div>
            </div>
            <div class="arch-arrow">↕ HTTP + WS</div>
            <div class="arch-row">
              <div class="arch-node">
                <div class="arch-node-title">REST API</div>
                <div class="arch-node-sub">Express · JWT-ga o'xshash token</div>
              </div>
              <div class="arch-node">
                <div class="arch-node-title">WebSocket Server</div>
                <div class="arch-node-sub">Real vaqtli yangilanishlar</div>
              </div>
            </div>
            <div class="arch-arrow">↓</div>
            <div class="arch-row">
              <div class="arch-node broker">
                <div class="arch-node-title">⚡ Xabar Brokeri</div>
                <div class="arch-node-sub">In-memory Pub/Sub</div>
              </div>
            </div>
            <div class="arch-arrow">↓</div>
            <div class="arch-row">
              <div class="arch-node">
                <div class="arch-node-title">⊙ Qabul</div>
                <div class="arch-node-sub">Check-in / Check-out</div>
              </div>
              <div class="arch-node">
                <div class="arch-node-title">✦ Tozalash</div>
                <div class="arch-node-sub">FIFO Queue · 12 soat</div>
              </div>
              <div class="arch-node">
                <div class="arch-node-title">◇ Xona Xizmati</div>
                <div class="arch-node-sub">Buyurtmalar holati</div>
              </div>
              <div class="arch-node">
                <div class="arch-node-title">⚒ Texnik Xizmat</div>
                <div class="arch-node-sub">Priority Queue</div>
              </div>
            </div>
            <div class="arch-arrow">↓</div>
            <div class="arch-row">
              <div class="arch-node">
                <div class="arch-node-title">💾 Davomli Saqlash</div>
                <div class="arch-node-sub">data.json (debounce 1s)</div>
              </div>
            </div>
          </div>

          <div style="margin-top:28px">
            <h4 style="font-family:var(--font-display);font-size:18px;margin-bottom:14px">Ma'lumotlar tuzilmalari</h4>
            <table class="table">
              <thead><tr><th>Tuzilma</th><th>Foydalanish</th><th>Sabab</th></tr></thead>
              <tbody>
                <tr><td><b>Array</b> (Massiv)</td><td>Xonalar inventari</td><td>Tartibli, indeks bo'yicha tez o'qish</td></tr>
                <tr><td><b>Map / Dict</b></td><td>Mehmonlar (id bo'yicha)</td><td>O(1) qidiruv</td></tr>
                <tr><td><b>Queue</b> (FIFO)</td><td>Xona xizmati buyurtmalari</td><td>Birinchi kelgan birinchi xizmat</td></tr>
                <tr><td><b>Priority Queue</b></td><td>Texnik xizmat so'rovlari</td><td>Kritik avval, FIFO tie-break</td></tr>
                <tr><td><b>Pub/Sub</b></td><td>Servislararo aloqa</td><td>Loose coupling, kengaytirilishi</td></tr>
              </tbody>
            </table>
          </div>

          <div style="margin-top:24px">
            <h4 style="font-family:var(--font-display);font-size:18px;margin-bottom:14px">Hodisa kanal (topic) lar</h4>
            <div class="event-log" style="background:#0F172A">
              <div class="event-entry"><span class="event-topic">guest.checked_in</span> — Mehmon kirdi (Qabul nashr etadi)</div>
              <div class="event-entry"><span class="event-topic">guest.checked_out</span> — Mehmon chiqdi (Tozalash obuna)</div>
              <div class="event-entry"><span class="event-topic">room.status_changed</span> — Xona holati o'zgardi (Panel obuna)</div>
              <div class="event-entry"><span class="event-topic">room.cleaning_required</span> — 12 soatlik tsikl (Bildirishnoma nashr etadi)</div>
              <div class="event-entry"><span class="event-topic">order.created / order.status_changed</span> — Xona xizmati hodisalari</div>
              <div class="event-entry"><span class="event-topic">maintenance.reported / maintenance.status_changed</span> — Texnik xizmat</div>
              <div class="event-entry"><span class="event-topic">notification.created</span> — Har qanday servisdan bildirishnoma</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ===========================================================================
  // PAGE: SETTINGS
  // ===========================================================================
  async function settings(container) {
    let s;
    try { s = (await API.settings()).settings; }
    catch (err) { UI.toast(err.message, { severity: 'danger' }); return; }

    const pol = policy();
    const canEdit = can('settings.update');
    const canReset = can('settings.reset');

    // Rol uchun ruxsat etilgan amallarning insonga qulay tavsifi
    const friendlyPerms = describePermissions(pol);

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">👤</span> Mening Rolim va Huquqlarim</h3>
          <span class="status-pill priority-${pol.role === 'manager' ? 'critical' : pol.role === 'reception' ? 'high' : 'normal'}">${esc(pol.displayName || pol.role)}</span>
        </div>
        <div class="card-body">
          <div style="margin-bottom:14px;color:var(--text-secondary);font-size:14px">${esc(pol.description || '')}</div>
          <div class="form-hint" style="margin-bottom:12px"><b>Foydalanuvchi:</b> ${esc(currentUser().username)} · <b>Rol:</b> ${esc(pol.role)}</div>
          <table class="table" style="margin-top:8px">
            <thead><tr><th>Imkoniyat</th><th style="width:120px">Holat</th></tr></thead>
            <tbody>
              ${friendlyPerms.map((p) => `
                <tr>
                  <td>${esc(p.label)}</td>
                  <td>${p.allowed ? '<span class="status-pill status-clean">✓ Ruxsat</span>' : '<span class="status-pill priority-low">✕ Yo\'q</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      ${!canEdit ? `
        <div class="card" style="border-left:4px solid var(--warning)">
          <div class="card-body">
            <div class="font-semibold" style="margin-bottom:4px">⚠ Faqat ko'rish rejimi</div>
            <div class="text-sm text-muted">Sizning rolingiz tizim sozlamalarini o'zgartirishga ruxsat etilmagan. Ma'muriy o'zgarishlar kerak bo'lsa, bosh menejerga murojaat qiling.</div>
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Tozalash Tartibi</h3>
        </div>
        <div class="card-body">
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Tozalash chastotasi (soatda)</div>
              <div class="settings-label-desc">Xonalar shu vaqtdan ko'p tozalanmagan bo'lsa, avtomatik bildirishnoma yuboriladi. Standart: 12 soat.</div>
            </div>
            <input class="form-input" type="number" min="1" max="72" id="set-cleaning-hours" value="${s.cleaningThresholdHours}" style="width:100px;text-align:center" ${canEdit ? '' : 'disabled'}>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Avtomatik tozalovchi xabarnomasi</div>
              <div class="settings-label-desc">12 soatdan oshganda tozalovchini avtomatik xabardor qilish va xonani navbatga qo'shish</div>
            </div>
            <label class="toggle"><input type="checkbox" id="set-auto-notify" ${s.autoNotifyHousekeeping ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><span class="toggle-slider"></span></label>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Xona vaqt o'lchagichini ko'rsatish</div>
              <div class="settings-label-desc">Har bir xona kartochkasida "tozalanganiga / iflosligiga" vaqtlarni ko'rsatish</div>
            </div>
            <label class="toggle"><input type="checkbox" id="set-show-timers" ${s.showRoomTimers ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><span class="toggle-slider"></span></label>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Bildirishnomalar</h3>
        </div>
        <div class="card-body">
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Ovoz</div>
              <div class="settings-label-desc">Yangi bildirishnoma kelganida brauzer signal chiqarsin</div>
            </div>
            <label class="toggle"><input type="checkbox" id="set-sound" ${s.notificationSound ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><span class="toggle-slider"></span></label>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Avtomatik yangilanish (sekund)</div>
              <div class="settings-label-desc">Panel real vaqtli WebSocket dan tashqari shu intervalda ham yangilanadi</div>
            </div>
            <input class="form-input" type="number" min="2" max="120" id="set-refresh" value="${s.autoRefreshSec}" style="width:100px;text-align:center" ${canEdit ? '' : 'disabled'}>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Panel Ko'rinishi</h3>
        </div>
        <div class="card-body">
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Til</div>
              <div class="settings-label-desc">Foydalanuvchi interfeysi tili</div>
            </div>
            <select class="form-select" id="set-language" style="width:160px" ${canEdit ? '' : 'disabled'}>
              <option value="uz" ${s.language === 'uz' ? 'selected' : ''}>O'zbekcha</option>
              <option value="ru" ${s.language === 'ru' ? 'selected' : ''}>Русский</option>
              <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
            </select>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Mavzu (tema)</div>
              <div class="settings-label-desc">Faqat ochiq mavzu mavjud (premium light)</div>
            </div>
            <select class="form-select" id="set-theme" style="width:160px" ${canEdit ? '' : 'disabled'}>
              <option value="light" selected>Ochiq (Default)</option>
              <option value="cream">Krem</option>
            </select>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Zichlik</div>
              <div class="settings-label-desc">Elementlar orasidagi bo'sh joy</div>
            </div>
            <select class="form-select" id="set-density" style="width:160px" ${canEdit ? '' : 'disabled'}>
              <option value="comfortable" ${s.density === 'comfortable' ? 'selected' : ''}>Qulay (Default)</option>
              <option value="compact" ${s.density === 'compact' ? 'selected' : ''}>Zich</option>
            </select>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Panelda hodisa jurnalini ko'rsatish</div>
              <div class="settings-label-desc">Dashboard sahifasida jonli hodisalar kartochkasini ko'rsatish</div>
            </div>
            <label class="toggle"><input type="checkbox" id="set-dashboard-events" ${s.dashboardShowEvents ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><span class="toggle-slider"></span></label>
          </div>
        </div>
      </div>

      ${seePrices() ? `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Pul Birligi</h3>
        </div>
        <div class="card-body">
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Valyuta</div>
              <div class="settings-label-desc">Barcha narxlar shu birlikda ko'rsatiladi</div>
            </div>
            <select class="form-select" id="set-currency" style="width:160px" disabled>
              <option value="UZS" selected>UZS (so'm)</option>
            </select>
          </div>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Saqlash va Tizim</h3>
        </div>
        <div class="card-body">
          ${canEdit ? `
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Sozlamalarni saqlash</div>
              <div class="settings-label-desc">Yuqoridagi o'zgarishlarni serverga yuborish</div>
            </div>
            <button class="btn btn-primary" id="save-settings">💾 Saqlash</button>
          </div>` : ''}
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Ma'lumotlarni eksport qilish</div>
              <div class="settings-label-desc">Joriy holatni JSON faylga yuklab olish</div>
            </div>
            <button class="btn btn-ghost" id="export-data">⬇ Yuklab olish</button>
          </div>
          ${canReset ? `
          <div class="settings-row">
            <div>
              <div class="settings-label-title">Barcha ma'lumotlarni qayta tiklash</div>
              <div class="settings-label-desc">DIQQAT: Barcha mehmonlar, buyurtmalar, so'rovlar o'chiriladi. Faqat menejer.</div>
            </div>
            <button class="btn btn-danger" id="reset-data">⚠ Qayta tiklash</button>
          </div>` : ''}
        </div>
      </div>
    `;

    if (canEdit) {
      $('#save-settings').addEventListener('click', async () => {
        const patch = {
          cleaningThresholdHours: parseInt($('#set-cleaning-hours').value, 10),
          autoNotifyHousekeeping: $('#set-auto-notify').checked,
          notificationSound: $('#set-sound').checked,
          showRoomTimers: $('#set-show-timers').checked,
          autoRefreshSec: parseInt($('#set-refresh').value, 10),
          language: $('#set-language').value,
          density: $('#set-density').value,
          dashboardShowEvents: $('#set-dashboard-events').checked,
        };
        try {
          await API.updateSettings(patch);
          UI.toast('Sozlamalar saqlandi', { severity: 'success' });
        } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
      });
    }

    $('#export-data').addEventListener('click', async () => {
      try {
        const data = await API.dashboardSummary();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `hotelos-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) { UI.toast(err.message, { severity: 'danger' }); }
    });

    if (canReset) {
      $('#reset-data').addEventListener('click', async () => {
        if (!confirm('Barcha ma\'lumotlar urug\'lik holatiga qaytadi. Davom etilsinmi?')) return;
        try {
          await API.resetData();
          UI.toast('Ma\'lumotlar qayta tiklandi', { severity: 'warning' });
          setTimeout(() => location.reload(), 800);
        } catch (err) {
          UI.toast(err.message, { severity: 'danger', title: 'Ruxsat yo\'q' });
        }
      });
    }
  }

  /** Foydalanuvchiga rolining huquqlarini insonga qulay tilda tushuntirish */
  function describePermissions(pol) {
    const has = (p) => (pol.permissions || []).includes(p);
    return [
      { label: 'Mehmonni check-in qilish',                  allowed: has('reception.checkin') },
      { label: 'Mehmonni check-out qilish va hisob ko\'rish', allowed: has('reception.checkout') },
      { label: 'Tozalash boshlash va yakunlash',              allowed: has('housekeeping.start') && has('housekeeping.complete') },
      { label: 'Xona xizmati buyurtmalarini yaratish',        allowed: has('orders.create') },
      { label: 'Texnik xizmat so\'rovi yaratish',             allowed: has('maintenance.report') },
      { label: 'Texnik xizmat so\'rovini hal etish',          allowed: has('maintenance.resolve') },
      { label: 'Narxlar va daromadlarni ko\'rish',            allowed: pol.canSeeFinancials === true },
      { label: 'Test stsenariylarini ishga tushirish',        allowed: has('tests.run') },
      { label: 'Tizim sozlamalarini o\'zgartirish',           allowed: has('settings.update') },
      { label: 'Barcha ma\'lumotlarni qayta tiklash',          allowed: has('settings.reset') },
    ];
  }

  // ===========================================================================
  // EXPORT
  // ===========================================================================
  window.HotelOS = window.HotelOS || {};
  window.HotelOS.Pages = {
    dashboard, rooms, reception, housekeeping, orders,
    maintenance, tests, events, architecture, settings,
  };
})();
