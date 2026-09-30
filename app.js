/**
 * EH BARBER HOUSE – PWA Randevu Uygulaması
 */

// ─────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────
const CONFIG = {
  WHATSAPP_NUMBER: '905348570482',
  BUSINESS_EMAIL:  'ehbarberhouse@gmail.com',
  SHOP_NAME:       'EH Barber House',
  SHOP_ADDRESS:    'İmamı Azam Caddesi, Fatih Mahallesi, Pendik / İstanbul',
  MAPS_URL:        'https://www.google.com/maps/place/EH+BARBER+HOUSE/@40.8651168,29.2969745,17z/data=!3m1!4b1!4m6!3m5!1s0x14cadd725d42468f:0x7f4933464fe4ddec!8m2!3d40.8651128!4d29.2995494!16s%2Fg%2F11nvz6qhtf',
  OPEN_HOUR:       10,
  CLOSE_HOUR:      22,
  SLOT_INTERVAL:   30
};

// ─────────────────────────────────────────
//  BERBERLER
// ─────────────────────────────────────────
const BARBERS = [
  { id: 1, name: 'Enes ÖZKAN',   avatar: '✂' },
  { id: 2, name: 'Hasan KABLAN', avatar: '✦' },
  { id: 3, name: 'Deniz ŞEKER',  avatar: '↝' },
  { id: 0, name: 'Fark Etmez',   avatar: '✂' }
];

// ─────────────────────────────────────────
//  HİZMETLER
// ─────────────────────────────────────────
const SERVICES = [
  { id: 'sac',     name: 'Saç Kesimi',          icon: '✂',  duration: 30 },
  { id: 'sakal',   name: 'Sakal Şekillendirme', icon: '⌁',  duration: 20 },
  { id: 'combo',   name: 'Saç + Sakal',         icon: '✦',  duration: 45 },
  { id: 'premium', name: 'Premium Bakım',       icon: '👑', duration: 60 }
];

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
const state = {
  barberId:    0,
  services:    ['sac'],
  dateIdx:     0,
  timeSlot:    null,
  dates:       [],
  lastBooking: null,
  pwaPrompt:   null
};

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildDates();
  initStatus();
  renderBarbers();
  renderServices();
  renderDates();
  renderSlots();
  recallCustomer();
  renderMyBookings();
  initPhoneMask();
  initNav();
  initForm();
  initAdmin();
  initPWA();
  updateContactLinks();
});

// ─────────────────────────────────────────
//  LIVE STATUS
// ─────────────────────────────────────────
function initStatus() {
  const pill = document.getElementById('live-status-pill');
  const txt  = document.getElementById('live-status-text');
  if (!pill || !txt) return;
  const now  = new Date();
  const day  = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (day === 0) {
    pill.className = 'status-pill closed'; txt.textContent = 'Pazar Kapalı';
  } else if (mins >= CONFIG.OPEN_HOUR * 60 && mins < CONFIG.CLOSE_HOUR * 60) {
    pill.className = 'status-pill open';   txt.textContent = 'Şu an Açık';
  } else {
    pill.className = 'status-pill closed'; txt.textContent = 'Şu an Kapalı';
  }
}

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────
//  14-GÜN TAKVİMİ
// ─────────────────────────────────────────
function buildDates() {
  const today = new Date(); today.setHours(0,0,0,0);
  const DN  = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const DS  = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
  const MN  = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    state.dates.push({
      index: i,
      dateStr: formatYMD(d),
      label: i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : DS[d.getDay()],
      fullDay: DN[d.getDay()],
      day: d.getDate(), month: MN[d.getMonth()],
      sunday: d.getDay() === 0
    });
  }
}

// ─────────────────────────────────────────
//  BERBERLER
// ─────────────────────────────────────────
function renderBarbers() {
  const el = document.getElementById('barbers-list');
  if (!el) return;
  el.innerHTML = BARBERS.map(b => `
    <button type="button" class="barber-btn${b.id === state.barberId ? ' selected' : ''}" data-id="${b.id}">
      <div class="barber-avatar">${b.avatar}</div>
      <div class="barber-name">${b.name}</div>
    </button>`).join('');

  el.querySelectorAll('.barber-btn').forEach(btn => btn.addEventListener('click', () => {
    state.barberId = +btn.dataset.id;
    renderBarbers();
    renderSlots();
  }));
}

// ─────────────────────────────────────────
//  HİZMETLER
// ─────────────────────────────────────────
function renderServices() {
  const el = document.getElementById('services-list');
  if (!el) return;
  el.innerHTML = SERVICES.map(s => {
    const on = state.services.includes(s.id);
    return `
      <div class="service-item${on ? ' selected' : ''}" data-sid="${s.id}">
        <div class="srv-left">
          <div class="srv-check">${on ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>
          <span class="srv-icon">${s.icon}</span>
          <div>
            <div class="srv-name">${s.name}</div>
            <div class="srv-meta">⏱ ~${s.duration} dk</div>
          </div>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.service-item').forEach(card => card.addEventListener('click', () => {
    const id = card.dataset.sid;
    if (state.services.includes(id)) {
      if (state.services.length > 1) {
        state.services = state.services.filter(x => x !== id);
      } else {
        showToast('En az bir hizmet seçmelisiniz.');
        return;
      }
    } else {
      state.services.push(id);
    }
    renderServices();
    syncSummary();
  }));

  syncSummary();
}

function syncSummary() {
  const sel = state.services.map(id => SERVICES.find(s => s.id === id)).filter(Boolean);
  const dur = sel.reduce((a, s) => a + s.duration, 0);
  const dEl = document.getElementById('summary-duration');
  if (dEl) dEl.textContent = `~${dur} dakika`;
}

// ─────────────────────────────────────────
//  TARİHLER
// ─────────────────────────────────────────
function renderDates() {
  const el = document.getElementById('dates-list');
  if (!el) return;
  el.innerHTML = state.dates.map(d => `
    <button type="button" class="date-btn${d.index === state.dateIdx ? ' selected' : ''}${d.sunday ? ' sunday' : ''}" data-idx="${d.index}">
      <span class="dn">${d.label}</span>
      <span class="dd">${d.day}</span>
      <span class="dm">${d.month}</span>
    </button>`).join('');

  el.querySelectorAll('.date-btn').forEach(btn => btn.addEventListener('click', () => {
    state.dateIdx = +btn.dataset.idx;
    state.timeSlot = null;
    renderDates();
    renderSlots();
  }));
}

// ─────────────────────────────────────────
//  SAAT SLOTLARI
// ─────────────────────────────────────────
function makeSlots() {
  const list = [];
  let h = CONFIG.OPEN_HOUR, m = 0;
  while (h < CONFIG.CLOSE_HOUR) {
    list.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += CONFIG.SLOT_INTERVAL;
    if (m >= 60) { h++; m = 0; }
  }
  return list;
}

function getBookings() {
  try { return JSON.parse(localStorage.getItem('eh_barber_bookings') || '[]'); } catch { return []; }
}

function renderSlots() {
  const el    = document.getElementById('times-list');
  const lbl   = document.getElementById('selected-date-label');
  const badge = document.getElementById('slot-count-badge');
  if (!el) return;

  const cur = state.dates[state.dateIdx];
  if (lbl) lbl.textContent = `${cur.day} ${cur.month} — ${cur.fullDay}`;

  if (cur.sunday) {
    el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:18px;color:var(--dim);font-size:13px;">Pazar günleri kapalıyız. Özel randevu için lütfen arayın.</div>`;
    if (badge) badge.textContent = 'Kapalı';
    return;
  }

  const allSlots = makeSlots();
  const now      = new Date();
  const isToday  = state.dateIdx === 0;
  const nowMins  = now.getHours() * 60 + now.getMinutes();
  const bookings = getBookings().filter(b => b.status !== 'cancelled' && b.dateStr === cur.dateStr);
  let avail = 0;

  el.innerHTML = allSlots.map(slot => {
    const [sh, sm] = slot.split(':').map(Number);
    const past   = isToday && (sh * 60 + sm) <= nowMins + 15;
    
    let booked = false;
    if (state.barberId === 0) {
      // Fark Etmez seçeneğinde tüm belirlenmiş berberler doluysa slot kapatılır
      const bookedBarberIds = bookings.filter(b => b.time === slot).map(b => b.barberId);
      const namedBarbers = BARBERS.filter(b => b.id !== 0);
      booked = namedBarbers.length > 0 && namedBarbers.every(b => bookedBarberIds.includes(b.id));
    } else {
      booked = bookings.some(b => b.time === slot && (b.barberId === state.barberId || b.barberId === 0));
    }

    const off    = past || booked;
    if (!off) avail++;
    const sel = state.timeSlot === slot;
    return `<button type="button" class="time-btn${sel ? ' selected' : ''}"${off ? ' disabled' : ''} data-slot="${slot}">${slot}</button>`;
  }).join('');

  if (badge) badge.textContent = `${avail} uygun saat`;

  el.querySelectorAll('.time-btn:not(:disabled)').forEach(btn => btn.addEventListener('click', () => {
    state.timeSlot = btn.dataset.slot;
    renderSlots();
  }));
}

// ─────────────────────────────────────────
//  TELEFON MASKELEME
// ─────────────────────────────────────────
function initPhoneMask() {
  const el = document.getElementById('customer-phone');
  if (!el) return;
  el.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.startsWith('90')) v = v.slice(2);
    if (v && !v.startsWith('0')) v = '0' + v;
    let f = '';
    if (v.length > 0) f += v.slice(0, 4);
    if (v.length > 4) f += ' ' + v.slice(4, 7);
    if (v.length > 7) f += ' ' + v.slice(7, 9);
    if (v.length > 9) f += ' ' + v.slice(9, 11);
    e.target.value = f;
  });
}

function recallCustomer() {
  try {
    const s = JSON.parse(localStorage.getItem('eh_barber_customer') || '{}');
    const n = document.getElementById('customer-name');  if (n && s.name)  n.value = s.name;
    const p = document.getElementById('customer-phone'); if (p && s.phone) p.value = s.phone;
  } catch {}
}

// ─────────────────────────────────────────
//  WHATSAPP YARDIMCISI
// ─────────────────────────────────────────
function openWhatsApp(url) {
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w || w.closed || typeof w.closed === 'undefined') {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch {
    window.location.href = url;
  }
}

// ─────────────────────────────────────────
//  RANDEVU FORMU
// ─────────────────────────────────────────
function initForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();

    if (!state.timeSlot) {
      showToast('Lütfen önce bir saat seçin.');
      const slotsCard = document.getElementById('times-list')?.closest('.section-card');
      if (slotsCard) {
        slotsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        slotsCard.classList.add('highlight-error');
        setTimeout(() => slotsCard.classList.remove('highlight-error'), 1800);
      }
      return;
    }

    const name  = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const notes = document.getElementById('customer-notes')?.value.trim() || '';

    if (!name || !phone) {
      showToast('Ad ve telefon alanları zorunludur.');
      return;
    }

    localStorage.setItem('eh_barber_customer', JSON.stringify({ name, phone }));

    const cur     = state.dates[state.dateIdx];
    const srvObjs = state.services.map(id => SERVICES.find(s => s.id === id)).filter(Boolean);
    const srvNames = srvObjs.map(s => s.name).join(' + ');
    const totalDur = srvObjs.reduce((a, s) => a + s.duration, 0);
    const id = 'EH-' + Date.now().toString().slice(-6);

    const all = getBookings();

    // Fark Etmez seçildiyse boşta olan berberi ata
    let barber = BARBERS.find(b => b.id === state.barberId);
    if (!barber || barber.id === 0) {
      const bookedBarberIds = all
        .filter(b => b.status !== 'cancelled' && b.dateStr === cur.dateStr && b.time === state.timeSlot)
        .map(b => b.barberId);
      const freeBarber = BARBERS.filter(b => b.id !== 0).find(b => !bookedBarberIds.includes(b.id));
      barber = freeBarber || BARBERS[0];
    }

    const booking = {
      id,
      barberId: barber.id,
      barberName: barber.name,
      serviceIds: [...state.services],
      serviceNames: srvNames,
      totalDuration: totalDur,
      dateStr: cur.dateStr,
      dateFormatted: `${cur.day} ${cur.month} ${cur.fullDay}`,
      time: state.timeSlot,
      customerName: name,
      customerPhone: phone,
      notes,
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };

    all.push(booking);
    localStorage.setItem('eh_barber_bookings', JSON.stringify(all));
    state.lastBooking = booking;

    renderSlots();
    renderMyBookings();

    // WhatsApp Mesajı
    const wa = [
      `EH BARBER HOUSE — Yeni Randevu Talebi`,
      ``,
      `Müşteri: ${name}`,
      `Telefon: ${phone}`,
      `Berber: ${barber.name}`,
      `Hizmet: ${srvNames}`,
      `Tarih: ${booking.dateFormatted}`,
      `Saat: ${state.timeSlot}`,
      notes ? `Not: ${notes}` : '',
      ``,
      `Randevumu onaylar mısınız?`
    ].filter(l => l !== '').join('\n');

    const waNum = getBusinessWhatsapp() || CONFIG.WHATSAPP_NUMBER;
    const waUrl = `https://api.whatsapp.com/send?phone=${waNum}&text=${encodeURIComponent(wa)}`;

    // WhatsApp'ı doğrudan aç (popup blocker engeline takılmadan)
    openWhatsApp(waUrl);

    // Başarı modalini göster
    openModal(booking, waUrl);
  });
}

function getBusinessEmail() {
  try { return JSON.parse(localStorage.getItem('eh_barber_profile') || '{}').email || CONFIG.BUSINESS_EMAIL; } catch { return CONFIG.BUSINESS_EMAIL; }
}

function getBusinessWhatsapp() {
  try { return (JSON.parse(localStorage.getItem('eh_barber_profile') || '{}').whatsapp || '').replace(/\D/g, ''); } catch { return ''; }
}

// ─────────────────────────────────────────
//  BAŞARI MODALİ
// ─────────────────────────────────────────
function openModal(b, waUrl) {
  const modal   = document.getElementById('success-modal');
  const preview = document.getElementById('modal-ticket-preview');
  if (!modal || !preview) return;

  preview.innerHTML = `
    <div class="trow"><span>Randevu No</span><strong>#${b.id}</strong></div>
    <div class="trow"><span>Berber</span><strong>${b.barberName}</strong></div>
    <div class="trow"><span>Hizmet</span><strong>${b.serviceNames}</strong></div>
    <div class="trow"><span>Tarih &amp; Saat</span><strong>${b.dateFormatted} — ${b.time}</strong></div>
    <div class="trow"><span>Tahmini Süre</span><strong>~${b.totalDuration || 30} dk</strong></div>
  `;

  const waBtn = document.getElementById('btn-open-whatsapp-again');
  if (waBtn) {
    waBtn.href = waUrl;
    waBtn.onclick = () => {
      openWhatsApp(waUrl);
    };
  }

  document.getElementById('btn-add-to-calendar').onclick = () => exportIcs(b);
  document.getElementById('btn-close-modal').onclick     = () => {
    modal.classList.remove('show');
    switchTab('tab-my-bookings');
  };

  modal.classList.add('show');
}

// ─────────────────────────────────────────
//  ICS TAKVİM
// ─────────────────────────────────────────
function exportIcs(b) {
  const [y, mo, d] = b.dateStr.split('-').map(Number);
  const [h, m]    = b.time.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, m, 0);
  const end   = new Date(start.getTime() + (b.totalDuration || 30) * 60000);
  const fmt   = dt => dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics   = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EH Barber House//Randevu//TR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${b.id}@ehbarberhouse`,
    `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:✂ EH Barber House — ${b.serviceNames}`,
    `DESCRIPTION:Berber: ${b.barberName}\\nHizmet: ${b.serviceNames}`,
    `LOCATION:${CONFIG.SHOP_ADDRESS}`, 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');

  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' })),
    download: `EHBarber_${b.id}.ics`
  });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Takvim dosyası indirildi!');
}

function getBookingWaUrl(b) {
  const waNum = getBusinessWhatsapp() || CONFIG.WHATSAPP_NUMBER;
  const msg = [
    `EH BARBER HOUSE — Randevu Bilgisi`,
    ``,
    `Randevu No: #${b.id}`,
    `Müşteri: ${b.customerName}`,
    `Berber: ${b.barberName}`,
    `Hizmet: ${b.serviceNames}`,
    `Tarih: ${b.dateFormatted}`,
    `Saat: ${b.time}`
  ].join('\n');
  return `https://api.whatsapp.com/send?phone=${waNum}&text=${encodeURIComponent(msg)}`;
}

// ─────────────────────────────────────────
//  RANDEVULARIM
// ─────────────────────────────────────────
function renderMyBookings() {
  const wrap = document.getElementById('my-bookings-container');
  const bdg  = document.getElementById('my-bookings-count');
  if (!wrap) return;

  const all    = getBookings().reverse();
  const active = all.filter(b => b.status !== 'cancelled');

  if (bdg) {
    bdg.textContent = active.length;
    bdg.classList.toggle('hidden', active.length === 0);
  }

  if (all.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <h3>Henüz Randevunuz Yok</h3>
        <p>"Randevu" sekmesinden ilk randevunuzu oluşturun.</p>
        <button class="btn-reserve" onclick="switchTab('tab-booking')">Hemen Randevu Al →</button>
      </div>`;
    return;
  }

  wrap.innerHTML = all.map(b => {
    const cancelled = b.status === 'cancelled';
    const waUrl = getBookingWaUrl(b);
    return `
      <div class="booking-item-card">
        <div class="bcard-top">
          <span class="bstatus ${cancelled ? 'past' : 'confirmed'}">${cancelled ? '✕ İptal' : '✓ Onaylı'}</span>
          <span class="bdate-title">${b.dateFormatted}</span>
        </div>
        <div class="bdetails">
          <div class="brow"><span>Saat</span><strong>${b.time} (~${b.totalDuration || 30} dk)</strong></div>
          <div class="brow"><span>Berber</span><strong>${b.barberName}</strong></div>
          <div class="brow"><span>Hizmet</span><strong>${b.serviceNames}</strong></div>
          <div class="brow"><span>Telefon</span><strong>${b.customerPhone}</strong></div>
        </div>
        <div class="bcard-actions">
          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-action wa-action-btn">💬 WhatsApp</a>
          <button class="btn-action" onclick="exportBkIcs('${b.id}')">📅 Takvime Ekle</button>
          ${!cancelled ? `<button class="btn-action danger" onclick="cancelBk('${b.id}')">✕ İptal Et</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

window.exportBkIcs = id => { const b = getBookings().find(x => x.id === id); if (b) exportIcs(b); };
window.cancelBk    = id => {
  if (!confirm('Randevuyu iptal etmek istediğinize emin misiniz?')) return;
  const updated = getBookings().map(b => b.id === id ? { ...b, status: 'cancelled' } : b);
  localStorage.setItem('eh_barber_bookings', JSON.stringify(updated));
  renderMyBookings();
  renderSlots();
  showToast('Randevu iptal edildi.');
};

// ─────────────────────────────────────────
//  YÖNETİCİ PANELİ
// ─────────────────────────────────────────
function initAdmin() {
  const passEl   = document.getElementById('admin-password');
  const loginBtn = document.getElementById('btn-admin-login');
  const authBox  = document.getElementById('admin-auth-box');
  const panel    = document.getElementById('admin-panel-content');
  const walkIn   = document.getElementById('btn-admin-add-walkin');

  if (!loginBtn) return;

  const ADMIN_PASSWORD = 'Enes.Hasan.2026.*';

  const togglePass = document.getElementById('toggle-password');
  togglePass?.addEventListener('click', () => {
    if (!passEl) return;
    passEl.type = passEl.type === 'password' ? 'text' : 'password';
    togglePass.textContent = passEl.type === 'password' ? '👁' : '🙈';
  });

  const tryLogin = () => {
    const pass = (passEl?.value || '').trim();
    if (pass === ADMIN_PASSWORD) {
      authBox?.classList.add('hidden');
      panel?.classList.remove('hidden');
      loadBusinessProfile();
      buildAdminDash();
      showToast('Hoş geldiniz!');
    } else {
      showToast('Şifre hatalı.');
    }
  };

  loginBtn.addEventListener('click', tryLogin);
  passEl?.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

  // İşletme profili kaydet
  const saveProfile = document.getElementById('btn-save-profile');
  if (saveProfile) {
    saveProfile.addEventListener('click', () => {
      const email    = document.getElementById('biz-email').value.trim();
      const phone    = document.getElementById('biz-phone').value.trim();
      const shopName = document.getElementById('biz-name').value.trim();
      const wa       = document.getElementById('biz-whatsapp').value.trim();
      const profile  = { email, phone, shopName, whatsapp: wa };
      localStorage.setItem('eh_barber_profile', JSON.stringify(profile));
      updateContactLinks();
      showToast('İşletme profili kaydedildi ✓');
    });
  }

  // Elden müşteri ekle (modal)
  const walkinModal = document.getElementById('walkin-modal');
  const walkinSlots = document.getElementById('walkin-slots');
  const walkinName  = document.getElementById('walkin-name');
  const btnSave     = document.getElementById('btn-walkin-save');
  const btnCancel   = document.getElementById('btn-walkin-cancel');
  let walkinTime = null;

  const renderWalkinSlots = () => {
    if (!walkinSlots) return;
    const cur      = state.dates[0] || { dateStr: formatYMD(new Date()) };
    const bookings = getBookings();
    const allSlots = makeSlots();
    walkinSlots.innerHTML = allSlots.map(slot => {
      const booked = bookings.some(b => b.dateStr === cur.dateStr && b.time === slot && b.status !== 'cancelled');
      const sel = walkinTime === slot;
      return `<button type="button" class="time-btn${sel ? ' selected' : ''}"${booked ? ' disabled' : ''} data-slot="${slot}">${slot}</button>`;
    }).join('');
    walkinSlots.querySelectorAll('.time-btn:not(:disabled)').forEach(btn => btn.addEventListener('click', () => {
      walkinTime = btn.dataset.slot;
      renderWalkinSlots();
    }));
  };

  walkIn?.addEventListener('click', () => {
    if (walkinName) walkinName.value = '';
    walkinTime = null;
    renderWalkinSlots();
    walkinModal?.classList.add('show');
  });

  btnSave?.addEventListener('click', () => {
    const name = (walkinName?.value || '').trim();
    if (!name) { showToast('Müşteri adı girin.'); return; }
    if (!walkinTime) { showToast('Bir saat seçin.'); return; }
    const cur = state.dates[0] || { dateStr: formatYMD(new Date()), day: new Date().getDate(), month: '', fullDay: 'Bugün' };
    const barberId = parseInt(document.getElementById('walkin-barber')?.value || '1', 10);
    const barber = BARBERS.find(b => b.id === barberId) || BARBERS[0];
    const wk  = {
      id: 'WALK-' + Date.now().toString().slice(-4),
      barberId: barber.id,
      barberName: barber.name,
      serviceIds: ['sac'],
      serviceNames: 'Saç Kesimi (Elden)',
      totalDuration: 30,
      dateStr: cur.dateStr,
      dateFormatted: `${cur.day} ${cur.month} ${cur.fullDay}`,
      time: walkinTime,
      customerName: name,
      customerPhone: 'Elden',
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };
    const all = getBookings();
    all.push(wk);
    localStorage.setItem('eh_barber_bookings', JSON.stringify(all));
    walkinModal?.classList.remove('show');
    buildAdminDash();
    renderSlots();
    showToast('Elden müşteri eklendi.');
  });

  btnCancel?.addEventListener('click', () => walkinModal?.classList.remove('show'));

  // Sekme geçişi
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel-body').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.panel);
      if (target) target.classList.remove('hidden');
      if (btn.dataset.panel === 'panel-today') buildAdminDash();
    });
  });
}

function updateContactLinks() {
  try {
    const p = JSON.parse(localStorage.getItem('eh_barber_profile') || '{}');
    const phone = p.phone || '0534 857 04 82';
    const cleanPhone = phone.replace(/\D/g, '');
    const wa = p.whatsapp || CONFIG.WHATSAPP_NUMBER;
    const cleanWa = wa.replace(/\D/g, '');
    const email = p.email || CONFIG.BUSINESS_EMAIL;

    const phEl = document.getElementById('contact-phone-link');
    if (phEl) {
      phEl.href = `tel:+${cleanPhone.startsWith('90') ? cleanPhone : '90' + cleanPhone.replace(/^0/, '')}`;
      phEl.textContent = `📞 ${phone}`;
    }

    const waEl = document.getElementById('contact-wa-link');
    if (waEl) {
      waEl.href = `https://api.whatsapp.com/send?phone=${cleanWa}`;
    }

    const emEl = document.getElementById('contact-email-link');
    if (emEl) {
      emEl.href = `mailto:${email}`;
      emEl.textContent = `✉️ ${email}`;
    }
  } catch {}
}

function loadBusinessProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('eh_barber_profile') || '{}');
    const eEl = document.getElementById('biz-email');
    const pEl = document.getElementById('biz-phone');
    const nEl = document.getElementById('biz-name');
    const wEl = document.getElementById('biz-whatsapp');
    if (eEl) eEl.value = p.email    || CONFIG.BUSINESS_EMAIL;
    if (pEl) pEl.value = p.phone    || '0534 857 04 82';
    if (nEl) nEl.value = p.shopName || CONFIG.SHOP_NAME;
    if (wEl) wEl.value = p.whatsapp || CONFIG.WHATSAPP_NUMBER;
  } catch {}
}

function buildAdminDash() {
  const todayStr = formatYMD(new Date());
  const list = getBookings()
    .filter(b => b.dateStr === todayStr && b.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time));
  const cEl = document.getElementById('admin-total-count');
  const lEl = document.getElementById('admin-schedule-list');
  if (cEl) cEl.textContent = list.length;
  if (!lEl) return;

  lEl.innerHTML = list.length === 0
    ? '<div style="text-align:center;padding:22px;color:var(--dim);font-size:13px;">Bugün için randevu yok.</div>'
    : list.map(b => `
        <div class="admin-row">
          <div class="admin-row-left">
            <div class="time-badge">${b.time}</div>
            <div>
              <div class="cust-name">${b.customerName}</div>
              <div class="cust-detail">${b.serviceNames} · ${b.barberName}</div>
            </div>
          </div>
          <div class="admin-row-actions">
            <a href="tel:${b.customerPhone}" class="btn-action" style="padding:6px 10px;">📞</a>
            <button class="btn-action danger" style="padding:6px 10px;" onclick="cancelBk('${b.id}')">✕</button>
          </div>
        </div>`).join('');
}
window.renderAdminDashboard = buildAdminDash;

// ─────────────────────────────────────────
//  NAV
// ─────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );
}

function switchTab(id) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.view-section').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchTab = switchTab;

// ─────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────
let _toastTmr = null;
function showToast(msg) {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTmr);
  _toastTmr = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─────────────────────────────────────────
//  PWA
// ─────────────────────────────────────────
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
  const installBtn = document.getElementById('install-pwa-btn');
  const banner     = document.getElementById('pwa-install-banner');
  const btnYes     = document.getElementById('btn-pwa-accept');
  const btnNo      = document.getElementById('btn-pwa-dismiss');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.pwaPrompt = e;
    installBtn?.classList.remove('hidden');
    if (banner && !sessionStorage.getItem('pwa_no')) banner.classList.remove('hidden');
  });

  const install = () => {
    if (!state.pwaPrompt) return;
    state.pwaPrompt.prompt();
    state.pwaPrompt.userChoice.then(r => {
      if (r.outcome === 'accepted') showToast('EH Barber House yüklendi!');
      state.pwaPrompt = null;
      banner?.classList.add('hidden');
      installBtn?.classList.add('hidden');
    });
  };

  installBtn?.addEventListener('click', install);
  btnYes?.addEventListener('click', install);
  btnNo?.addEventListener('click', () => {
    banner?.classList.add('hidden');
    sessionStorage.setItem('pwa_no', '1');
  });
}
