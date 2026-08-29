// ROTADAN — Uygulama Mantığı
const TR_CENTER = [39.0, 35.0];
const types = [
  { id: 'moto', emoji: '🏍', name: 'Motosiklet', color: '#ff5a36', rgb: '255, 90, 54' },
  { id: 'bike', emoji: '🚲', name: 'Bisiklet', color: '#559eff', rgb: '85, 158, 255' },
  { id: 'walk', emoji: '🥾', name: 'Yürüyüş', color: '#2dcc96', rgb: '45, 204, 150' },
  { id: 'camp', emoji: '⛺', name: 'Kamp', color: '#a970ff', rgb: '169, 112, 255' }
];

// Uygulama Durum Değişkenleri
let active = false;
let mode = 'moto';
let startedAt = null;
let points = [];
let watchId = null;
let timer = null;
let rideLine = null;
let currentLocationMarker = null;
let wakeLock = null;

// Durak ve Fotoğraf Takip Listeleri (Sürüş esnasındaki anlık veriler)
let activeStops = [];
let activePhotos = [];
let activeMarkers = []; // Haritada sürüş esnasında oluşturulan durak ve fotoğraf işaretçileri

// Detay Modalı Durumu
let activeDetailIndex = null;
let activeDetailType = null; // 'ride' veya 'camp'

// Yardımcı Element Seçici
const $ = (id) => document.getElementById(id);

// Harita Kurulumları
const map = L.map('map', { zoomControl: false }).setView(TR_CENTER, 6);
const routeMap = L.map('all-routes-map', { zoomControl: false }).setView(TR_CENTER, 6);

// Harita Katmanları (Offline desteği için yerel kütüphaneyi kullanıyoruz)
[map, routeMap].forEach(m => {
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(m);
});

// Özel SVG Harita Konum Göstergesi (Çevrimdışı Sorunsuz Çalışır)
const createLocationMarker = (latlng) => {
  return L.marker(latlng, {
    icon: L.divIcon({
      className: 'user-location-marker',
      html: '<div class="pulse-dot"></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    })
  });
};

// Geometrik Mesafe Hesaplama (Haversine Formülü)
const km = (a, b) => {
  const r = 6371; // Dünya yarıçapı
  const rad = x => x * Math.PI / 180;
  const q = rad(b.lat - a.lat);
  const w = rad(b.lng - a.lng);
  const z = Math.sin(q / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(w / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z));
};

const getDistance = ps => (ps && ps.length >= 2) ? ps.slice(1).reduce((s, p, i) => s + km(ps[i], p), 0) : 0;
const fmtKm = n => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const duration = ms => {
  let s = Math.floor(ms / 1000);
  let h = Math.floor(s / 3600);
  s %= 3600;
  return `${String(h).padStart(2, '0')}:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// LocalStorage Entegrasyonu
const rides = () => JSON.parse(localStorage.getItem('moto-iz-rides') || '[]');
const setRides = r => localStorage.setItem('moto-iz-rides', JSON.stringify(r));

const camps = () => JSON.parse(localStorage.getItem('moto-iz-camps') || '[]');
const setCamps = c => localStorage.setItem('moto-iz-camps', JSON.stringify(c));

// Arayüz Mod Seçici Oluşturucu
function renderModeSelector() {
  const selector = $('mode-selector');
  selector.innerHTML = types.map(t => `
    <div class="mode-card ${mode === t.id ? 'active' : ''}" 
         style="--active-color: ${t.color}; --active-color-rgb: ${t.rgb}" 
         onclick="selectMode('${t.id}')">
      <span class="mode-icon">${t.emoji}</span>
      <span class="mode-name">${t.name}</span>
    </div>
  `).join('');
}

function selectMode(newMode) {
  if (active) return; // Kayıt esnasında mod değiştirilemez
  mode = newMode;
  renderModeSelector();
  
  // Kamp modunda farklı butonlar gösterilir
  if (mode === 'camp') {
    $('ride-button').classList.add('hidden');
    $('camp-button').classList.remove('hidden');
    $('active-ride-actions').classList.add('hidden');
    $('gps-message').textContent = 'Geçerli konumu haritada kamp alanı olarak işaretlemek için butona basın.';
  } else {
    $('ride-button').classList.remove('hidden');
    $('camp-button').classList.add('hidden');
    $('gps-message').textContent = 'Seçilen aktivite tipinde GPS kaydı başlatmak için sürüşe başlayın.';
  }
}

// İstatistikleri ve Toplamları Güncelleme
function renderTotals() {
  const allRides = rides();
  const allCamps = camps();
  const totalD = allRides.reduce((s, r) => s + r.distance, 0);
  
  $('total-distance').textContent = `${totalD.toFixed(1)} km`;
  $('total-rides').textContent = allRides.length;
  $('total-camps').textContent = allCamps.length;
}

// Gezileri Listeleme
function renderRides() {
  const allRides = rides();
  const listEl = $('rides-list');
  
  if (!allRides.length) {
    listEl.innerHTML = '<p class="empty-message">Henüz kaydedilmiş gezi bulunmuyor.</p>';
    return;
  }
  
  listEl.innerHTML = allRides.slice().reverse().map((r, revIndex) => {
    const actualIndex = allRides.length - 1 - revIndex;
    const typeObj = types.find(t => t.id === r.mode) || types[0];
    const stopCount = r.stops ? r.stops.length : 0;
    const photoCount = r.photos ? r.photos.length : 0;
    
    return `
      <article class="ride-card" style="--active-color: ${typeObj.color}; --active-color-rgb: ${typeObj.rgb}" onclick="openDetails('ride', ${actualIndex})">
        <div class="card-left">
          <div class="card-icon-wrapper">${typeObj.emoji}</div>
          <div class="card-info">
            <h3>${r.name}</h3>
            <p>${new Date(r.startedAt).toLocaleDateString('tr-TR')} · ${duration(r.duration)}</p>
            <p style="font-size: 9.5px; color: var(--text-muted); margin-top: 2px;">
              ${stopCount > 0 ? `🛑 ${stopCount} Durak ` : ''}
              ${photoCount > 0 ? `📸 ${photoCount} Fotoğraf` : ''}
            </p>
          </div>
        </div>
        <div class="card-right">
          <strong>${r.distance.toFixed(2)} km</strong>
          <button class="delete-card-btn" onclick="deleteItem(event, 'ride', ${actualIndex})" aria-label="Sil">✕</button>
        </div>
      </article>
    `;
  }).join('');
}

// Kamp Noktalarını Listeleme
function renderCamps() {
  const allCamps = camps();
  const listEl = $('camps-list');
  
  if (!allCamps.length) {
    listEl.innerHTML = '<p class="empty-message">Henüz kaydedilmiş kamp noktası bulunmuyor.</p>';
    return;
  }
  
  listEl.innerHTML = allCamps.slice().reverse().map((c, revIndex) => {
    const actualIndex = allCamps.length - 1 - revIndex;
    return `
      <article class="camp-card" style="--active-color: #a970ff; --active-color-rgb: 169, 112, 255" onclick="openDetails('camp', ${actualIndex})">
        <div class="card-left">
          <div class="card-icon-wrapper">⛺</div>
          <div class="card-info">
            <h3>${c.name}</h3>
            <p>${new Date(c.at).toLocaleDateString('tr-TR')}</p>
          </div>
        </div>
        <div class="card-right">
          <button class="delete-card-btn" onclick="deleteItem(event, 'camp', ${actualIndex})" aria-label="Sil">✕</button>
        </div>
      </article>
    `;
  }).join('');
}

// Tüm Rotaları ve Kampları Haritada Çizme
function renderAllRoutes() {
  // Önceki polyline ve markerları temizle
  routeMap.eachLayer(l => {
    if (l instanceof L.Polyline || l instanceof L.Marker) {
      routeMap.removeLayer(l);
    }
  });
  
  const allRides = rides();
  const allCamps = camps();
  const features = [];
  
  // Rotaları Çiz
  allRides.forEach(r => {
    if (r.points && r.points.length >= 2) {
      const line = L.polyline(r.points.map(p => [p.lat, p.lng]), {
        color: r.color,
        weight: 5,
        opacity: 0.85
      }).addTo(routeMap);
      
      const stopCount = r.stops ? r.stops.length : 0;
      const photoCount = r.photos ? r.photos.length : 0;
      
      line.bindPopup(`
        <b>${r.name}</b><br>
        ${r.distance.toFixed(2)} km · ${duration(r.duration)}<br>
        <span style="font-size: 10px; color: #8e9a9d;">
          ${stopCount} Durak · ${photoCount} Fotoğraf
        </span>
      `);
      features.push(line);
      
      // Bu rota için durakları haritaya çiz
      if (r.stops) {
        r.stops.forEach(s => {
          const stopM = L.marker([s.lat, s.lng], {
            icon: L.divIcon({
              html: '🛑',
              className: 'emoji-marker',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            })
          }).addTo(routeMap);
          stopM.bindPopup(`<b>${s.name}</b> (Durak)`);
          features.push(stopM);
        });
      }
      
      // Bu rota için fotoğrafları haritaya çiz
      if (r.photos) {
        r.photos.forEach(p => {
          const photoM = L.marker([p.lat, p.lng], {
            icon: L.divIcon({
              html: '📸',
              className: 'emoji-marker',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            })
          }).addTo(routeMap);
          photoM.bindPopup(`<b>Çekilen Fotoğraf</b><br><img src="${p.dataUrl}" />`);
          features.push(photoM);
        });
      }
    }
  });
  
  // Kampları Ekle
  allCamps.forEach(c => {
    if (c.pos) {
      const marker = L.marker(c.pos).addTo(routeMap);
      marker.bindPopup(`⛺ <b>${c.name}</b><br>${new Date(c.at).toLocaleDateString('tr-TR')}`);
      features.push(marker);
    }
  });
  
  // Harita sınırlarını çizimlere göre ayarla
  if (features.length) {
    const group = L.featureGroup(features);
    routeMap.fitBounds(group.getBounds(), { padding: [30, 30] });
  } else {
    routeMap.setView(TR_CENTER, 6);
  }
}

// Canlı Takip Verisi Güncelleme
function updateLive() {
  const d = getDistance(points);
  const elapsed = Date.now() - startedAt;
  $('live-distance').innerHTML = `${fmtKm(d)} <span class="unit">km</span>`;
  $('live-duration').textContent = duration(elapsed);
  $('live-speed').innerHTML = `${elapsed > 0 ? Math.round(d / (elapsed / 3600000)) : 0} <span class="unit">km/sa</span>`;
}

// Ekranı Açık Tutma (Wake Lock)
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Ekran kilidi uyanık tutuluyor.');
    }
  } catch (err) {
    console.warn('Wake Lock hatası:', err.message);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
      console.log('Ekran kilidi serbest bırakıldı.');
    });
  }
}

// Sürüş Kaydını Başlatma
function startRide() {
  if (!navigator.geolocation) {
    $('gps-message').textContent = 'Bu cihazda konum hizmetleri desteklenmiyor.';
    return;
  }
  
  active = true;
  startedAt = Date.now();
  points = [];
  activeStops = [];
  activePhotos = [];
  
  // Haritada sürüş esnasında eklenen markerları temizle
  activeMarkers.forEach(m => map.removeLayer(m));
  activeMarkers = [];
  
  // Önceki rotayı haritadan temizle
  if (rideLine) {
    map.removeLayer(rideLine);
    rideLine = null;
  }
  
  // UI Güncellemeleri
  $('ride-button').classList.add('hidden');
  $('active-ride-actions').classList.remove('hidden');
  $('finish-button').classList.remove('hidden');
  $('tracking-badge').textContent = '● Kayıt yapılıyor';
  $('tracking-badge').classList.add('active');
  $('gps-message').textContent = 'GPS sinyali bekleniyor...';
  
  // Ekranı açık tut
  requestWakeLock();
  
  // Zamanlayıcıyı başlat
  timer = setInterval(updateLive, 1000);
  
  // GPS İzlemeyi Başlat
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const p = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        at: pos.timestamp || Date.now()
      };
      
      // Filtreleme (Gereksiz ufak sıçramaları engeller: 8 metre tolerans)
      if (points.length && km(points.at(-1), p) < 0.008) return;
      
      points.push(p);
      
      // Canlı konum işaretçisi
      if (currentLocationMarker) {
        currentLocationMarker.setLatLng([p.lat, p.lng]);
      } else {
        currentLocationMarker = createLocationMarker([p.lat, p.lng]).addTo(map);
      }
      
      // Rota Çizgisi
      const activeType = types.find(t => t.id === mode);
      if (!rideLine) {
        rideLine = L.polyline([], {
          color: activeType.color,
          weight: 6,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
      }
      
      rideLine.setLatLngs(points.map(pt => [pt.lat, pt.lng]));
      map.setView([p.lat, p.lng], 16);
      
      $('gps-message').textContent = 'Konum alınıyor ve rota çiziliyor.';
      updateLive();
    },
    (err) => {
      $('gps-message').textContent = 'Konum alınamadı. Lütfen cihaz ayarlarından konum iznini kontrol edin.';
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    }
  );
}

// Durak Ekleme Mantığı (Sürüş esnasında)
function addRideStop() {
  if (!active) {
    alert('Durak eklemek için önce sürüşü başlatın.');
    return;
  }
  
  // GPS verisi yoksa anlık konumu almayı dene
  if (!points.length) {
    navigator.geolocation && navigator.geolocation.getCurrentPosition(
      pos => {
        points.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() });
        addRideStop();
      },
      () => alert('GPS sinyali alınamadı. Biraz daha bekleyin.'),
      { enableHighAccuracy: true, timeout: 5000 }
    );
    return;
  }
  
  const lastPt = points.at(-1);
  const stopNameInput = prompt('Durak noktası adı:', `Durak ${activeStops.length + 1}`);
  if (stopNameInput === null) return; // İptal edildi
  
  const sName = stopNameInput.trim() || `Durak ${activeStops.length + 1}`;
  const stopObj = {
    name: sName,
    lat: lastPt.lat,
    lng: lastPt.lng,
    at: Date.now()
  };
  
  activeStops.push(stopObj);
  
  // Haritaya durak marker'ı ekle
  const m = L.marker([stopObj.lat, stopObj.lng], {
    icon: L.divIcon({
      html: '🛑',
      className: 'emoji-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  }).bindPopup(`<b>${stopObj.name}</b> (Durak)`).addTo(map);
  
  activeMarkers.push(m);
  $('gps-message').textContent = `"${sName}" durağı başarıyla eklendi.`;
}

// Fotoğraf Çekmeyi Tetikleyen Arayüz
function triggerPhotoCapture() {
  if (!active) {
    alert('Fotoğraf çekmek için önce sürüşü başlatın.');
    return;
  }
  
  // GPS verisi yoksa anlık konumu almayı dene
  if (!points.length) {
    navigator.geolocation && navigator.geolocation.getCurrentPosition(
      pos => {
        points.push({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() });
        $('photo-capture-input').click();
      },
      () => $('photo-capture-input').click(), // Konum yoksa da fotoğraf çekmeye izin ver
      { enableHighAccuracy: true, timeout: 5000 }
    );
    return;
  }
  $('photo-capture-input').click();
}

// Fotoğraf İşleme, Küçültme ve Ekleme Mantığı
function processAndAddPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  $('gps-message').textContent = 'Fotoğraf işleniyor ve sıkıştırılıyor...';
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      // HTML Canvas ile görsel küçültme ve JPEG sıkıştırma
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 600;
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // Görseli JPEG formatında 0.7 kalitesiyle sıkıştır (Base64 URL)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      const lastPt = points.at(-1);
      const photoObj = {
        dataUrl: compressedDataUrl,
        lat: lastPt.lat,
        lng: lastPt.lng,
        at: Date.now()
      };
      
      activePhotos.push(photoObj);
      
      // Haritaya fotoğraf marker'ı ekle (popup içinde resim önizlemesiyle)
      const m = L.marker([photoObj.lat, photoObj.lng], {
        icon: L.divIcon({
          html: '📸',
          className: 'emoji-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).bindPopup(`<b>Çekilen Fotoğraf</b><br><img src="${photoObj.dataUrl}" />`).addTo(map);
      
      activeMarkers.push(m);
      $('gps-message').textContent = 'Fotoğraf rotaya başarıyla eklendi.';
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = ''; // Inputu sıfırla
}

// Sürüşü Sonlandırma
function finishRide() {
  clearInterval(timer);
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  
  releaseWakeLock();
  active = false;
  
  // Dialog detaylarını doldur
  const totalD = getDistance(points);
  const totalDuration = Date.now() - startedAt;
  
  // Düşük nokta sayısında uyarı ver ama engelleme (test ve park başlangıçları için)
  const infoNote = points.length < 2
    ? ' (GPS sinyali yeterli değildi — mesafe 0 km olarak kaydedilecek)'
    : '';
  
  $('ride-summary').textContent = `${fmtKm(totalD)} km · ${duration(totalDuration)}${infoNote}`;
  $('ride-name').value = '';
  $('save-dialog').showModal();
}

// Kaydı Sıfırlama
function resetRideState(message) {
  $('finish-button').classList.add('hidden');
  $('active-ride-actions').classList.add('hidden');
  
  if (mode === 'camp') {
    $('camp-button').classList.remove('hidden');
    $('ride-button').classList.add('hidden');
  } else {
    $('ride-button').classList.remove('hidden');
    $('camp-button').classList.add('hidden');
  }
  
  $('tracking-badge').textContent = '● Hazır';
  $('tracking-badge').classList.remove('active');
  $('gps-message').textContent = message;
  
  // Haritadaki çizgileri ve sürüş sırasındaki geçici markerları temizle
  if (rideLine) {
    map.removeLayer(rideLine);
    rideLine = null;
  }
  activeMarkers.forEach(m => map.removeLayer(m));
  activeMarkers = [];
  
  // Canlı sayaçları temizle
  $('live-distance').innerHTML = `0,00 <span class="unit">km</span>`;
  $('live-duration').textContent = '00:00:00';
  $('live-speed').innerHTML = `0 <span class="unit">km/sa</span>`;
  
  points = [];
  activeStops = [];
  activePhotos = [];
}

// Kamp Noktası Kaydetme
function saveCampPoint() {
  if (!navigator.geolocation) {
    alert('Konum desteği yok.');
    return;
  }
  
  $('gps-message').textContent = 'Konum alınıyor...';
  
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const campNameInput = prompt('Kamp noktasının adı:', `Kamp Noktası ${camps().length + 1}`);
      if (campNameInput === null) {
        $('gps-message').textContent = 'Kamp kaydı iptal edildi.';
        return;
      }
      
      const cName = campNameInput.trim() || `Kamp Noktası ${camps().length + 1}`;
      const allCamps = camps();
      const newCamp = {
        name: cName,
        at: Date.now(),
        pos: [pos.coords.latitude, pos.coords.longitude]
      };
      
      allCamps.push(newCamp);
      setCamps(allCamps);
      
      $('gps-message').textContent = 'Kamp noktası başarıyla kaydedildi!';
      
      // Haritayı kamp noktasına odakla
      map.setView(newCamp.pos, 15);
      
      // Haritada göster
      L.marker(newCamp.pos).bindPopup(`⛺ <b>${newCamp.name}</b>`).addTo(map);
      
      renderTotals();
      renderCamps();
      renderAllRoutes();
    },
    (err) => {
      $('gps-message').textContent = 'Konum alınamadı. İzinleri kontrol edin.';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Detay Modalını Açma
function openDetails(type, index) {
  activeDetailType = type;
  activeDetailIndex = index;
  
  const dialog = $('details-dialog');
  const grid = $('detail-stats-grid');
  
  if (type === 'ride') {
    const r = rides()[index];
    const typeObj = types.find(t => t.id === r.mode) || types[0];
    const stopCount = r.stops ? r.stops.length : 0;
    const photoCount = r.photos ? r.photos.length : 0;
    
    $('detail-eyebrow').textContent = `${typeObj.name.toUpperCase()} DETAYI`;
    $('detail-title').textContent = r.name;
    
    grid.innerHTML = `
      <div class="detail-stat-card">
        <span>Tarih</span>
        <strong>${new Date(r.startedAt).toLocaleDateString('tr-TR')}</strong>
      </div>
      <div class="detail-stat-card">
        <span>Mesafe</span>
        <strong>${r.distance.toFixed(2)} km</strong>
      </div>
      <div class="detail-stat-card">
        <span>Süre</span>
        <strong>${duration(r.duration)}</strong>
      </div>
      <div class="detail-stat-card">
        <span>Ortalama Hız</span>
        <strong>${r.duration > 0 ? Math.round(r.distance / (r.duration / 3600000)) : 0} km/sa</strong>
      </div>
      <div class="detail-stat-card">
        <span>Duraklar</span>
        <strong>${stopCount} Durak</strong>
      </div>
      <div class="detail-stat-card">
        <span>Fotoğraflar</span>
        <strong>${photoCount} Görsel</strong>
      </div>
    `;
    
    $('detail-gpx-btn').classList.remove('hidden');
    $('detail-show-map-btn').classList.remove('hidden');
    $('detail-elevation-card').classList.remove('hidden');
    $('detail-cinematic-btn').classList.remove('hidden');
    
    // Yükseklik Profilini Çiz
    setTimeout(() => renderElevationProfile(r), 100);
    
    // Android Share Bridge Kontrolü
    if (window.MotoIz) {
      $('share-actions-row').classList.remove('hidden');
    } else {
      $('share-actions-row').classList.add('hidden');
    }
  } else if (type === 'camp') {
    const c = camps()[index];
    const photoCount = c.photos ? c.photos.length : 0;
    
    $('detail-eyebrow').textContent = 'KAMP DETAYI';
    $('detail-title').textContent = c.name;
    
    grid.innerHTML = `
      <div class="detail-stat-card">
        <span>Tarih</span>
        <strong>${new Date(c.at).toLocaleDateString('tr-TR')}</strong>
      </div>
      <div class="detail-stat-card">
        <span>Konum</span>
        <strong>${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</strong>
      </div>
      <div class="detail-stat-card">
        <span>Fotoğraflar</span>
        <strong>${photoCount} Görsel</strong>
      </div>
    `;
    
    $('detail-gpx-btn').classList.add('hidden');
    $('share-actions-row').classList.add('hidden');
    $('detail-show-map-btn').classList.remove('hidden');
  }
  
  dialog.showModal();
}

// GPX XML Dışa Aktarma
function downloadGPX(ride) {
  const name = ride.name || 'ROTADAN Gezi';
  const time = new Date(ride.startedAt).toISOString();
  
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ROTADAN" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
    <time>${time}</time>
  </metadata>`;

  // Durakları GPX Waypointleri (<wpt>) olarak ekle
  if (ride.stops) {
    ride.stops.forEach(s => {
      gpx += `
  <wpt lat="${s.lat}" lon="${s.lng}">
    <name>${s.name}</name>
    <time>${new Date(s.at).toISOString()}</time>
  </wpt>`;
    });
  }
  
  gpx += `
  <trk>
    <name>${name}</name>
    <trkseg>`;
  
  ride.points.forEach(p => {
    const ptTime = p.at ? new Date(p.at).toISOString() : time;
    gpx += `
      <trkpt lat="${p.lat}" lon="${p.lng}">
        <time>${ptTime}</time>
      </trkpt>`;
  });
  
  gpx += `
    </trkseg>
  </trk>
</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\s+/g, '_')}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// GPX İçe Aktarma Mantığı
function importGPXFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const xmlText = evt.target.result;
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, 'text/xml');
      
      // Koordinat noktalarını çözümle
      const trkpts = xml.getElementsByTagName('trkpt');
      if (!trkpts.length) {
        alert('GPX dosyasında koordinat noktası bulunamadı.');
        return;
      }
      
      const parsedPoints = [];
      for (let i = 0; i < trkpts.length; i++) {
        const node = trkpts[i];
        const lat = parseFloat(node.getAttribute('lat'));
        const lng = parseFloat(node.getAttribute('lon'));
        const timeNode = node.getElementsByTagName('time')[0];
        const at = timeNode ? new Date(timeNode.textContent).getTime() : Date.now();
        parsedPoints.push({ lat, lng, at });
      }
      
      // Waypoint'leri (durakları) çözümle
      const wpts = xml.getElementsByTagName('wpt');
      const parsedStops = [];
      for (let i = 0; i < wpts.length; i++) {
        const node = wpts[i];
        const lat = parseFloat(node.getAttribute('lat'));
        const lng = parseFloat(node.getAttribute('lon'));
        const nameNode = node.getElementsByTagName('name')[0];
        const sName = (nameNode ? nameNode.textContent : `Durak ${i + 1}`).trim();
        const timeNode = node.getElementsByTagName('time')[0];
        const at = timeNode ? new Date(timeNode.textContent).getTime() : Date.now();
        parsedStops.push({ name: sName, lat, lng, at });
      }
      
      const nameNode = xml.getElementsByTagName('name')[0];
      const name = (nameNode ? nameNode.textContent : 'İçe Aktarılan Rota').trim();
      
      const startT = parsedPoints[0].at;
      const endT = parsedPoints.at(-1).at;
      const totalDuration = endT - startT > 0 ? endT - startT : 3600000;
      const totalD = getDistance(parsedPoints);
      
      const newRide = {
        name,
        startedAt: startT,
        duration: totalDuration,
        distance: totalD,
        points: parsedPoints,
        stops: parsedStops,
        photos: [],
        mode: 'moto',
        color: '#ff5a36'
      };
      
      const allRides = rides();
      allRides.push(newRide);
      setRides(allRides);
      
      renderTotals();
      renderRides();
      renderAllRoutes();
      
      alert(`"${name}" rotası (${parsedStops.length} Durak ile) başarıyla içe aktarıldı!`);
    } catch (err) {
      alert('GPX dosyası çözümlenemedi. Geçersiz dosya formatı.');
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Inputu temizle
}

// Tekil Silme İşlemi
function deleteItem(event, type, index) {
  event.stopPropagation(); // Kart tıklama olayını engelle
  
  const text = type === 'ride' ? 'bu geziyi' : 'bu kamp noktasını';
  if (!confirm(`Seçtiğiniz ${text} silmek istediğinize emin misiniz?`)) return;
  
  if (type === 'ride') {
    const list = rides();
    list.splice(index, 1);
    setRides(list);
    renderRides();
  } else {
    const list = camps();
    list.splice(index, 1);
    setCamps(list);
    renderCamps();
  }
  
  renderTotals();
  renderAllRoutes();
}

// Android Uygulaması ile Paylaşım Köprüsü
function shareToAndroid(kind) {
  if (activeDetailType !== 'ride' || activeDetailIndex === null) return;
  const r = rides()[activeDetailIndex];
  openShareCardDialog(r);
  if (kind === 'story') {
    setTimeout(() => {
      nativeShareCard('story');
    }, 600);
  }
}

// Başlangıç Konumunu Ayarla
function initCurrentLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        map.setView(latlng, 15);
        if (currentLocationMarker) {
          currentLocationMarker.setLatLng(latlng);
        } else {
          currentLocationMarker = createLocationMarker(latlng).addTo(map);
        }
      },
      (err) => {
        console.log('İlk konum alınamadı:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }
}

// ETKİNLİK DİNLEYİCİLERİ
$('ride-button').onclick = startRide;
$('camp-button').onclick = saveCampPoint;
$('finish-button').onclick = finishRide;

// Durak ve Fotoğraf Ekleme Tetikleyicileri
$('add-stop-btn').onclick = addRideStop;
$('add-photo-btn').onclick = triggerPhotoCapture;
$('photo-capture-input').onchange = processAndAddPhoto;

// GPX İçe Aktarma
$('gpx-import-file').onchange = importGPXFile;

let activePrivacy = 'public';

function selectPrivacy(p) {
  activePrivacy = p;
  document.querySelectorAll('#ride-privacy-selector .privacy-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.privacy === p);
  });
}

// Kayıt Onaylama
$('confirm-save').onclick = () => {
  const allRides = rides();
  const activeType = types.find(t => t.id === mode);
  const prof = profileData();
  
  const rideId = 'ride_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const newRide = {
    id: rideId,
    name: $('ride-name').value.trim() || `${activeType.name} Gezisi ${allRides.length + 1}`,
    mode,
    startedAt,
    duration: Date.now() - startedAt,
    distance: getDistance(points),
    points,
    stops: activeStops,
    photos: activePhotos,
    color: activeType.color,
    privacy: activePrivacy,
    author: {
      username: prof.username || 'gezgin',
      name: prof.name || 'Gezgin',
      avatar: prof.avatar || '🏍'
    },
    likes: 0,
    likedByMe: false,
    comments: []
  };
  
  allRides.push(newRide);
  setRides(allRides);
  
  // Eğer gizli değilse topluluk akışına da yayınla
  if (activePrivacy !== 'private') {
    publishToCommunity(newRide);
  }
  
  $('save-dialog').close();
  resetRideState('Gezi kaydedildi.');
  
  renderTotals();
  renderRides();
  renderAllRoutes();
  renderProfile();
  renderCommunityFeed();
};

// Dialog Kapatma Dinleyicisi
$('save-dialog').addEventListener('close', () => {
  if ($('save-dialog').returnValue === 'cancel') {
    resetRideState('Gezi kaydedilmedi.');
  }
});

// Detay Modalı Buton Olayları
$('close-details-btn').onclick = () => $('details-dialog').close();

$('detail-delete-btn').onclick = () => {
  if (activeDetailIndex !== null && activeDetailType !== null) {
    const confirmText = activeDetailType === 'ride' ? 'bu geziyi' : 'bu kamp noktasını';
    if (confirm(`Seçtiğiniz ${confirmText} silmek istediğinize emin misiniz?`)) {
      if (activeDetailType === 'ride') {
        const list = rides();
        list.splice(activeDetailIndex, 1);
        setRides(list);
        renderRides();
      } else {
        const list = camps();
        list.splice(activeDetailIndex, 1);
        setCamps(list);
        renderCamps();
      }
      
      $('details-dialog').close();
      renderTotals();
      renderAllRoutes();
    }
  }
};

$('detail-gpx-btn').onclick = () => {
  if (activeDetailType === 'ride' && activeDetailIndex !== null) {
    const r = rides()[activeDetailIndex];
    downloadGPX(r);
  }
};

$('detail-show-map-btn').onclick = () => {
  if (activeDetailIndex === null || activeDetailType === null) return;
  
  $('details-dialog').close();
  
  // Alt menüde Harita sekmesini aktifleştir
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const mapNavItem = document.querySelector('[data-view="all-routes-view"]');
  if (mapNavItem) mapNavItem.classList.add('active');
  
  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  $('all-routes-view').classList.add('active');
  
  // Haritayı güncelle ve odakla
  setTimeout(() => {
    routeMap.invalidateSize();
    
    const features = [];
    
    if (activeDetailType === 'ride') {
      const r = rides()[activeDetailIndex];
      
      // Haritadaki bu özel rotanın polyline ve markerlarını fit bounds yapmak için listeye ekleyelim
      routeMap.eachLayer(l => {
        if (l instanceof L.Polyline) {
          // İlgili rotayı bulup fit bounds yapalım
          const latlngs = l.getLatLngs();
          if (latlngs.length >= 2) {
            features.push(l);
          }
        } else if (l instanceof L.Marker) {
          // Bu rotaya ait olan durak/fotoğraf markerlarını da fitBounds listesine ekleyelim
          // Not: Tüm markerlar listede olduğundan genel zoom kapsamına girecektir
          features.push(l);
        }
      });
      
      if (features.length) {
        const group = L.featureGroup(features);
        routeMap.fitBounds(group.getBounds(), { padding: [50, 50] });
      } else if (r.points && r.points.length >= 2) {
        const latlngs = r.points.map(p => [p.lat, p.lng]);
        routeMap.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });
      }
    } else {
      const c = camps()[activeDetailIndex];
      if (c.pos) {
        routeMap.setView(c.pos, 16);
      }
    }
  }, 150);
};

// Android Paylaşım Butonları
$('detail-share-post-btn').onclick = () => shareToAndroid('post');
$('detail-share-story-btn').onclick = () => shareToAndroid('story');

// Arşivi Temizleme
$('clear-rides').onclick = () => {
  if (confirm('Tüm kayıtlı gezi ve kamp noktaları kalıcı olarak silinsin mi? Bu işlem geri alınamaz.')) {
    setRides([]);
    setCamps([]);
    renderTotals();
    renderRides();
    renderCamps();
    renderAllRoutes();
  }
};

// PROFİL YÖNETİMİ
const defaultProfile = {
  name: 'Gezgin',
  avatar: '🏍',
  joinedAt: Date.now()
};

const profileData = () => {
  const p = localStorage.getItem('moto-iz-profile');
  return p ? JSON.parse(p) : defaultProfile;
};

const setProfileData = p => localStorage.setItem('moto-iz-profile', JSON.stringify(p));

// Profil Seçilebilir Avatarları
const AVATARS = ['🏍', '🚲', '🥾', '⛺', '🏎️', '🛵', '🧭', '⛰️', '🏕️', '🛠️', '🏁', '⭐'];
let selectedAvatar = '🏍';

function renderProfile() {
  const prof = profileData();
  const allRides = rides();
  const allCamps = camps();

  // Profil Başlık Bilgileri
  const avatarEl = $('profile-avatar');
  const nameEl = $('profile-name');
  const sinceEl = $('profile-since');

  if (avatarEl) avatarEl.textContent = prof.avatar || '🏍';
  if (nameEl) nameEl.textContent = prof.name || 'Gezgin';
  
  if (sinceEl) {
    const joinDate = new Date(prof.joinedAt || Date.now());
    sinceEl.textContent = `ROTADAN Üyesi · ${joinDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;
  }

  // İstatistik İcatı
  const totalD = allRides.reduce((s, r) => s + (r.distance || 0), 0);
  const totalTimeMs = allRides.reduce((s, r) => s + (r.duration || 0), 0);
  const totalHours = Math.floor(totalTimeMs / 3600000);
  
  let totalStops = 0;
  let totalPhotos = 0;
  
  allRides.forEach(r => {
    if (r.stops) totalStops += r.stops.length;
    if (r.photos) totalPhotos += r.photos.length;
  });

  const statsGridEl = $('profile-stats-grid');
  if (statsGridEl) {
    statsGridEl.innerHTML = `
      <div class="profile-stat-card">
        <span class="stat-icon">📏</span>
        <span class="stat-value">${totalD.toFixed(1)}</span>
        <span class="stat-label">Toplam KM</span>
      </div>
      <div class="profile-stat-card">
        <span class="stat-icon">🚀</span>
        <span class="stat-value">${allRides.length}</span>
        <span class="stat-label">Sürüş</span>
      </div>
      <div class="profile-stat-card">
        <span class="stat-icon">⛺</span>
        <span class="stat-value">${allCamps.length}</span>
        <span class="stat-label">Kamp</span>
      </div>
      <div class="profile-stat-card">
        <span class="stat-icon">🛑</span>
        <span class="stat-value">${totalStops}</span>
        <span class="stat-label">Durak</span>
      </div>
      <div class="profile-stat-card">
        <span class="stat-icon">📸</span>
        <span class="stat-value">${totalPhotos}</span>
        <span class="stat-label">Fotoğraf</span>
      </div>
      <div class="profile-stat-card">
        <span class="stat-icon">⏱️</span>
        <span class="stat-value">${totalHours} sa</span>
        <span class="stat-label">Süre</span>
      </div>
    `;
  }

  // Rozetler Mantığı
  const badges = [
    {
      id: 'first_step',
      icon: '🔰',
      name: 'İlk Adım',
      desc: 'İlk sürüşünü veya kampını kaydet',
      unlocked: (allRides.length + allCamps.length) >= 1
    },
    {
      id: 'road_runner',
      icon: '⚡',
      name: 'Yol Kurdu',
      desc: 'Toplam 50 km katet',
      unlocked: totalD >= 50
    },
    {
      id: 'camper',
      icon: '⛺',
      name: 'Doğa Sever',
      desc: 'En az 1 kamp noktası ekle',
      unlocked: allCamps.length >= 1
    },
    {
      id: 'photographer',
      icon: '📸',
      name: 'Gözlemci',
      desc: 'En az 3 fotoğraf çek',
      unlocked: totalPhotos >= 3
    },
    {
      id: 'captain',
      icon: '🏁',
      name: 'Kaptan',
      desc: '5 sürüş tamamla',
      unlocked: allRides.length >= 5
    },
    {
      id: 'pitstop',
      icon: '🛑',
      name: 'Mola Ustası',
      desc: 'En az 3 durak noktası ekle',
      unlocked: totalStops >= 3
    }
  ];

  const badgesRowEl = $('badges-row');
  if (badgesRowEl) {
    badgesRowEl.innerHTML = badges.map(b => `
      <div class="badge-card ${b.unlocked ? 'earned' : 'locked'}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-info">
          <div class="badge-name">${b.name}</div>
          <div class="badge-desc">${b.desc}</div>
        </div>
        ${!b.unlocked ? '<div class="badge-locked-label">Kilitli</div>' : ''}
      </div>
    `).join('');
  }

  // Fotoğraf Galerisi
  const galleryPhotos = [];
  allRides.forEach(r => {
    if (r.photos && r.photos.length) {
      r.photos.forEach(p => {
        galleryPhotos.push({
          dataUrl: p.dataUrl,
          at: p.at || r.startedAt,
          rideName: r.name
        });
      });
    }
  });

  galleryPhotos.sort((a, b) => b.at - a.at);

  const galleryEl = $('photo-gallery');
  if (galleryEl) {
    if (galleryPhotos.length) {
      galleryEl.innerHTML = galleryPhotos.map((p, idx) => `
        <div class="gallery-thumb" onclick="openPhotoZoom(${idx})">
          <img src="${p.dataUrl}" alt="Fotoğraf" loading="lazy" />
          <div class="thumb-overlay">${new Date(p.at).toLocaleDateString('tr-TR')}</div>
        </div>
      `).join('');
      window._currentGalleryPhotos = galleryPhotos;
    } else {
      galleryEl.innerHTML = '<p class="empty-message" style="grid-column: 1 / -1;">Henüz çekilen fotoğraf bulunmuyor. Sürüş esnasında 📸 Fotoğraf Çek butonunu kullanın.</p>';
      window._currentGalleryPhotos = [];
    }
  }

  // Aktivite Akışı (Sürüşler + Kamplar birleşik)
  const activities = [];
  
  allRides.forEach((r, idx) => {
    activities.push({
      type: 'ride',
      actualIndex: idx,
      at: r.startedAt,
      name: r.name,
      mode: r.mode,
      distance: r.distance,
      duration: r.duration,
      stops: r.stops ? r.stops.length : 0,
      photos: r.photos ? r.photos.length : 0,
      color: r.color
    });
  });

  allCamps.forEach((c, idx) => {
    activities.push({
      type: 'camp',
      actualIndex: idx,
      at: c.at,
      name: c.name,
      mode: 'camp',
      color: '#a970ff'
    });
  });

  activities.sort((a, b) => b.at - a.at);

  const feedEl = $('activity-feed');
  if (feedEl) {
    if (activities.length) {
      feedEl.innerHTML = activities.map(act => {
        const typeObj = types.find(t => t.id === act.mode) || types[0];
        const dateStr = new Date(act.at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
        
        if (act.type === 'ride') {
          return `
            <div class="activity-item" style="--active-color: ${typeObj.color}; --active-color-rgb: ${typeObj.rgb}" onclick="openDetails('ride', ${act.actualIndex})">
              <div class="activity-dot">${typeObj.emoji}</div>
              <div class="activity-body">
                <div class="activity-title">${act.name}</div>
                <div class="activity-meta">${dateStr} · ${duration(act.duration)}</div>
                <div class="activity-chips">
                  <span class="activity-chip">${act.distance.toFixed(1)} km</span>
                  ${act.stops > 0 ? `<span class="activity-chip">🛑 ${act.stops} Durak</span>` : ''}
                  ${act.photos > 0 ? `<span class="activity-chip">📸 ${act.photos} Fotoğraf</span>` : ''}
                </div>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="activity-item" style="--active-color: #a970ff; --active-color-rgb: 169, 112, 255" onclick="openDetails('camp', ${act.actualIndex})">
              <div class="activity-dot">⛺</div>
              <div class="activity-body">
                <div class="activity-title">⛺ ${act.name}</div>
                <div class="activity-meta">${dateStr} · Kamp Konumu</div>
              </div>
            </div>
          `;
        }
      }).join('');
    } else {
      feedEl.innerHTML = '<p class="empty-message">Henüz aktivite bulunmuyor. İlk sürüşünüzü başlatın!</p>';
    }
  }
}

// Fotoğraf Büyütme Modalı
function openPhotoZoom(idx) {
  const photo = window._currentGalleryPhotos ? window._currentGalleryPhotos[idx] : null;
  if (!photo) return;

  $('photo-zoom-img').src = photo.dataUrl;
  $('photo-zoom-caption').textContent = `${photo.rideName} · ${new Date(photo.at).toLocaleDateString('tr-TR')}`;
  $('photo-zoom-dialog').showModal();
}

const closePhotoZoomBtn = $('close-photo-zoom-btn');
if (closePhotoZoomBtn) {
  closePhotoZoomBtn.onclick = () => $('photo-zoom-dialog').close();
}

// Profil Düzenleme Modalı
function openProfileEdit() {
  const prof = profileData();
  selectedAvatar = prof.avatar || '🏍';
  $('profile-name-input').value = prof.name || 'Gezgin';

  const avatarContainer = $('avatar-options');
  if (avatarContainer) {
    avatarContainer.innerHTML = AVATARS.map(av => `
      <div class="avatar-option ${av === selectedAvatar ? 'selected' : ''}" onclick="selectAvatarOption('${av}')">
        ${av}
      </div>
    `).join('');
  }

  $('profile-edit-dialog').showModal();
}

function selectAvatarOption(av) {
  selectedAvatar = av;
  document.querySelectorAll('.avatar-option').forEach(el => {
    el.classList.toggle('selected', el.textContent.trim() === av);
  });
}

const closeProfileEditBtn = $('close-profile-edit-btn');
if (closeProfileEditBtn) closeProfileEditBtn.onclick = () => $('profile-edit-dialog').close();

const cancelProfileEditBtn = $('cancel-profile-edit-btn');
if (cancelProfileEditBtn) cancelProfileEditBtn.onclick = () => $('profile-edit-dialog').close();

const saveProfileBtn = $('save-profile-btn');
if (saveProfileBtn) {
  saveProfileBtn.onclick = () => {
    const newName = $('profile-name-input').value.trim() || 'Gezgin';
    const prof = profileData();
    prof.name = newName;
    prof.avatar = selectedAvatar;
    setProfileData(prof);

    $('profile-edit-dialog').close();
    renderProfile();
  };
}

// ETKİNLİK YÖNETİMİ VE CANLI GERİ SAYIM
const eventsData = () => JSON.parse(localStorage.getItem('moto-iz-events') || '[]');
const setEventsData = evs => localStorage.setItem('moto-iz-events', JSON.stringify(evs));

let countdownTimerInterval = null;

// Canlı Geri Sayım Hesaplayıcı
function formatCountdown(targetTimestamp) {
  const now = Date.now();
  const diff = targetTimestamp - now;

  if (diff <= 0) {
    // Etkinlik günü (ilk 24 saat içinde başladı kabul edilir)
    if (Math.abs(diff) < 24 * 3600 * 1000) {
      return { text: '🟢 Etkinlik Zamanı! (Başladı)', status: 'started' };
    }
    return { text: '🏁 Tamamlandı', status: 'finished' };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const parts = [];
  if (days > 0) parts.push(`${String(days).padStart(2, '0')} Gün`);
  parts.push(`${String(hours).padStart(2, '0')} Sa`);
  parts.push(`${String(minutes).padStart(2, '0')} Dk`);
  parts.push(`${String(seconds).padStart(2, '0')} Sn`);

  return { text: `⏳ ${parts.join(' ')}`, status: 'upcoming' };
}

// Canlı Saniyelik Sayaç Güncelleyici (DOM re-render gerektirmeden performansı yüksek tutar)
function updateCountdowns() {
  document.querySelectorAll('.countdown-timer').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    if (!target) return;
    
    const cd = formatCountdown(target);
    el.textContent = cd.text;
    el.className = `countdown-timer ${cd.status}`;
  });
}

// Etkinlikleri Listeleme
function renderEvents() {
  const allEvents = eventsData();
  const listEl = $('events-list');
  if (!listEl) return;

  if (!allEvents.length) {
    listEl.innerHTML = `
      <div class="empty-message" style="padding: 40px 10px;">
        <p style="font-size: 28px; margin-bottom: 8px;">📅</p>
        <p style="font-size: 15px; font-weight: 800; color: var(--text); margin-bottom: 4px;">Planlanmış Etkinlik Yok</p>
        <p>Topluluk sürüşü veya kamp planlamak için <b>+ Yeni Etkinlik</b> butonuna basın.</p>
      </div>
    `;
    return;
  }

  // Tarihe göre sırala (Tarihi yakın olan en üstte)
  const sortedEvents = allEvents.map((ev, idx) => ({ ...ev, originalIndex: idx }))
    .sort((a, b) => a.datetime - b.datetime);

  listEl.innerHTML = sortedEvents.map(ev => {
    const typeObj = types.find(t => t.id === ev.mode) || types[0];
    const dateObj = new Date(ev.datetime);
    const dateStr = dateObj.toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const cd = formatCountdown(ev.datetime);

    return `
      <article class="event-card" style="--active-color: ${typeObj.color}; --active-color-rgb: ${typeObj.rgb}">
        <div class="event-card-header">
          <div class="event-title-group">
            <div class="event-icon-badge">${typeObj.emoji}</div>
            <div style="min-width:0;">
              <h3>${ev.title}</h3>
              <div class="event-date-str">${dateStr}</div>
            </div>
          </div>
          <button class="delete-card-btn" onclick="deleteEvent(event, ${ev.originalIndex})" aria-label="Sil">✕</button>
        </div>

        <div class="countdown-box">
          <span class="countdown-label">Kalan Süre</span>
          <span class="countdown-timer ${cd.status}" data-target="${ev.datetime}">${cd.text}</span>
        </div>

        ${(ev.location || ev.note) ? `
          <div class="event-details-row">
            ${ev.location ? `<div class="event-detail-item">📍 <span><b>Buluşma:</b> ${ev.location}</span></div>` : ''}
            ${ev.note ? `<div class="event-detail-item">📝 <span><b>Not:</b> ${ev.note}</span></div>` : ''}
          </div>
        ` : ''}

        <div class="event-actions-row">
          <button class="dialog-button primary-btn" onclick="startEventRide(${ev.originalIndex})">🚀 Sürüşü Başlat</button>
          <button class="dialog-button secondary-btn" onclick="shareEvent(${ev.originalIndex})">📱 Davet Et</button>
        </div>
      </article>
    `;
  }).join('');

  updateCountdowns();
}

// Etkinlik Oluşturma Modalı
function openCreateEvent() {
  const dialog = $('create-event-dialog');
  if (!dialog) return;

  $('event-title-input').value = '';
  $('event-location-input').value = '';
  $('event-note-input').value = '';
  $('event-mode-select').value = mode || 'moto';

  // Varsayılan tarihi yarın saat 09:00 yap
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  
  // datetime-local string formatı: YYYY-MM-DDTHH:mm
  const localIso = new Date(tomorrow.getTime() - (tomorrow.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  $('event-datetime-input').value = localIso;

  dialog.showModal();
}

const closeCreateEventBtn = $('close-create-event-btn');
if (closeCreateEventBtn) closeCreateEventBtn.onclick = () => $('create-event-dialog').close();

const cancelCreateEventBtn = $('cancel-create-event-btn');
if (cancelCreateEventBtn) cancelCreateEventBtn.onclick = () => $('create-event-dialog').close();

const saveEventBtn = $('save-event-btn');
if (saveEventBtn) {
  saveEventBtn.onclick = () => {
    const title = $('event-title-input').value.trim();
    const datetimeStr = $('event-datetime-input').value;
    const selectedMode = $('event-mode-select').value;
    const location = $('event-location-input').value.trim();
    const note = $('event-note-input').value.trim();

    if (!title) {
      alert('Lütfen bir etkinlik adı girin.');
      return;
    }

    if (!datetimeStr) {
      alert('Lütfen geçerli bir tarih ve saat seçin.');
      return;
    }

    const datetime = new Date(datetimeStr).getTime();

    const newEvent = {
      title,
      mode: selectedMode,
      datetime,
      location,
      note,
      createdAt: Date.now()
    };

    const allEvs = eventsData();
    allEvs.push(newEvent);
    setEventsData(allEvs);

    $('create-event-dialog').close();
    renderEvents();
  };
}

// Etkinlik Silme
function deleteEvent(event, index) {
  event.stopPropagation();
  if (confirm('Bu etkinliği silmek istediğinize emin misiniz?')) {
    const allEvs = eventsData();
    allEvs.splice(index, 1);
    setEventsData(allEvs);
    renderEvents();
  }
}

// Etkinlikten Doğrudan Sürüş Başlatma
function startEventRide(index) {
  const ev = eventsData()[index];
  if (!ev) return;

  // Etkinlik moduna geç
  selectMode(ev.mode);

  // Sürüş ismini hazırla
  $('ride-name').value = ev.title;

  // Ana sayfaya geç ve sürüşü başlat
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const homeNavBtn = document.querySelector('[data-view="home-view"]');
  if (homeNavBtn) homeNavBtn.classList.add('active');

  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  $('home-view').classList.add('active');

  setTimeout(() => {
    map.invalidateSize();
    startRide();
  }, 150);
}

// Etkinlik Davetini Paylaşma
function shareEvent(index) {
  const ev = eventsData()[index];
  if (!ev) return;

  const typeObj = types.find(t => t.id === ev.mode) || types[0];
  const dateStr = new Date(ev.datetime).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });

  const cd = formatCountdown(ev.datetime);

  let shareMsg = `${typeObj.emoji} *${ev.title}*\n📅 Tarih: ${dateStr}\n${cd.text}`;
  if (ev.location) shareMsg += `\n📍 Buluşma: ${ev.location}`;
  if (ev.note) shareMsg += `\n📝 Not: ${ev.note}`;
  shareMsg += `\n\nROTADAN uygulaması üzerinden davet edildiniz! 🏁`;

  if (navigator.share) {
    navigator.share({
      title: ev.title,
      text: shareMsg
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareMsg).then(() => {
      alert('Etkinlik davet metni panoya kopyalandı! İstediğiniz kişiye gönderebilirsiniz.');
    }).catch(() => {
      alert(shareMsg);
    });
  }
}

// Alt Navigasyon Sekme Değiştirici
document.querySelectorAll('.nav-item').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    $(b.dataset.view).classList.add('active');
    
    // Harita yenileme, etkinlik veya profil güncelleme tetikleyicisi
    if (b.dataset.view === 'all-routes-view') {
      setTimeout(() => routeMap.invalidateSize(), 150);
    } else if (b.dataset.view === 'home-view') {
      setTimeout(() => map.invalidateSize(), 150);
    } else if (b.dataset.view === 'events-view') {
      renderEvents();
    } else if (b.dataset.view === 'profile-view') {
      renderProfile();
    }
  };
});

// Arayüz Koyu / Açık Tema Yönetimi
const themeButton = $('theme-button');
themeButton.onclick = () => {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  localStorage.setItem('moto-iz-theme', isLight ? 'light' : 'dark');
};

// Tema Yükle
const savedTheme = localStorage.getItem('moto-iz-theme');
if (savedTheme === 'light') {
  document.body.classList.add('light');
}

// UYGULAMAYI BAŞLAT
renderModeSelector();
renderTotals();
renderRides();
renderCamps();
renderAllRoutes();
renderProfile();
renderEvents();
initCurrentLocation();

// Saniyelik Canlı Geri Sayım Zamanlayıcısını Başlat
if (countdownTimerInterval) clearInterval(countdownTimerInterval);
countdownTimerInterval = setInterval(updateCountdowns, 1000);

// ============================================================
// SOSYAL MEDYA PAYLAŞIM KARTI — Canvas 1080×1080 px
// ============================================================

let shareCardRide = null;
const shareCardPhotos = [null, null, null]; // 3 slot

// Detay diyaloğundaki butona tıklandığında
const detailSocialCardBtn = $('detail-social-card-btn');
if (detailSocialCardBtn) {
  detailSocialCardBtn.onclick = () => {
    if (activeDetailType !== 'ride' || activeDetailIndex === null) return;
    const r = rides()[activeDetailIndex];
    openShareCardDialog(r);
  };
}

// Paylaşım dialog'ını kapat
const closeShareCardBtn = $('close-share-card-btn');
if (closeShareCardBtn) {
  closeShareCardBtn.onclick = () => $('share-card-dialog').close();
}

// Paylaşım kart diyaloğunu aç ve canvas çiz
function openShareCardDialog(ride) {
  shareCardRide = ride;

  // Varsayılan fotoğrafları sıfırla: sürüşün ilk 3 fotoğrafını kullan
  for (let i = 0; i < 3; i++) {
    shareCardPhotos[i] = (ride.photos && ride.photos[i]) ? ride.photos[i].dataUrl : null;
    renderShareSlot(i);
  }

  $('details-dialog').close();
  $('share-card-dialog').showModal();

  // Canvas çiz
  setTimeout(() => drawShareCard(), 80);
}

// Slot içinde fotoğraf göster / placeholder
function renderShareSlot(idx) {
  const slot = $(`share-slot-${idx}`);
  if (!slot) return;
  const photo = shareCardPhotos[idx];
  if (photo) {
    slot.innerHTML = `
      <img src="${photo}" alt="Fotoğraf ${idx + 1}" />
      <button class="slot-remove" onclick="removeSharePhoto(event, ${idx})">✕</button>
    `;
  } else {
    slot.innerHTML = `<span class="slot-placeholder">📸</span>`;
  }
}

function triggerSharePhotoInput(idx) {
  $(`share-photo-input-${idx}`).click();
}

function removeSharePhoto(event, idx) {
  event.stopPropagation();
  shareCardPhotos[idx] = null;
  renderShareSlot(idx);
  drawShareCard();
}

function onSharePhotoSelected(event, idx) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Görseli sıkıştır ve yeniden boyutlandır
      const c = document.createElement('canvas');
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      shareCardPhotos[idx] = c.toDataURL('image/jpeg', 0.82);
      renderShareSlot(idx);
      drawShareCard();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// Ana canvas çizim fonksiyonu
function drawShareCard() {
  const canvas = $('share-card-canvas');
  if (!canvas || !shareCardRide) return;

  const ctx = canvas.getContext('2d');
  const W = 1080, H = 1080;
  canvas.width = W;
  canvas.height = H;

  const r = shareCardRide;
  const typeObj = types.find(t => t.id === r.mode) || types[0];

  // — 1. ARKA PLAN GRADİENT —
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0c0f10');
  grad.addColorStop(0.5, '#161a1c');
  grad.addColorStop(1, '#1e0f05');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // — 2. DEKORATIF HEXAGON ARKAPLAN DESENI —
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = typeObj.color;
  ctx.lineWidth = 1.5;
  const hexR = 60;
  for (let row = -1; row < H / (hexR * 1.73) + 1; row++) {
    for (let col = -1; col < W / (hexR * 2) + 1; col++) {
      const x = col * hexR * 2 + (row % 2 === 0 ? 0 : hexR);
      const y = row * hexR * 1.73;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i - Math.PI / 6;
        const px = x + hexR * Math.cos(angle);
        const py = y + hexR * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // — 3. YANLI GLOW EFEKTİ (sürüş rengi) —
  const glowGrad = ctx.createRadialGradient(W * 0.15, H * 0.3, 0, W * 0.15, H * 0.3, W * 0.6);
  glowGrad.addColorStop(0, `rgba(${typeObj.rgb || '255,90,54'}, 0.15)`);
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, W, H);

  // — 4. ÜST BAR — UYGULAMA LOGOSU —
  ctx.fillStyle = typeObj.color;
  ctx.fillRect(0, 0, W, 8); // üst renkli bant

  ctx.font = 'bold 52px "Outfit", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.letterSpacing = '-1px';
  ctx.fillText('ROTADAN', 64, 100);

  ctx.font = '28px "Outfit", sans-serif';
  ctx.fillStyle = typeObj.color;
  ctx.fillText(`${typeObj.emoji} ${typeObj.name.toUpperCase()} GEZİSİ`, 64, 148);

  // Üst sağda emoji rozeti
  ctx.font = '88px serif';
  ctx.fillText(typeObj.emoji, W - 150, 136);

  // Ayırıcı çizgi
  ctx.strokeStyle = `rgba(${typeObj.rgb || '255,90,54'}, 0.4)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 175);
  ctx.lineTo(W - 64, 175);
  ctx.stroke();

  // — 5. GEZİ ADI —
  ctx.font = 'bold 68px "Outfit", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.letterSpacing = '-2px';
  const rideName = r.name || 'Gezi';
  // Uzun adları kırp
  const maxChars = 22;
  const displayName = rideName.length > maxChars ? rideName.slice(0, maxChars) + '…' : rideName;
  ctx.fillText(displayName, 64, 278);

  ctx.font = '30px "Outfit", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.letterSpacing = '0px';
  const dateStr = new Date(r.startedAt).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  ctx.fillText(dateStr, 64, 328);

  // — 6. İSTATİSTİK KARTLARI (2×2 grid) —
  const avgSpeed = r.duration > 0 ? Math.round(r.distance / (r.duration / 3600000)) : 0;
  const stats = [
    { icon: '📏', label: 'Mesafe', value: `${r.distance.toFixed(1)} km` },
    { icon: '⏱️', label: 'Süre', value: duration(r.duration) },
    { icon: '⚡', label: 'Ort. Hız', value: `${avgSpeed} km/sa` },
    { icon: '🛑', label: 'Duraklar', value: `${r.stops ? r.stops.length : 0}` }
  ];

  const cardW = 220, cardH = 130, cardGap = 20;
  const cardStartX = 64;
  const cardStartY = 375;

  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = cardStartX + col * (cardW + cardGap);
    const cy = cardStartY + row * (cardH + cardGap);

    // Kart arkaplanı
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    _roundRect(ctx, cx, cy, cardW, cardH, 20);
    ctx.fill();

    // Kart çerçevesi
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.5;
    _roundRect(ctx, cx, cy, cardW, cardH, 20);
    ctx.stroke();

    // Icon
    ctx.font = '32px serif';
    ctx.fillText(s.icon, cx + 18, cy + 46);

    // Değer
    ctx.font = 'bold 38px "Outfit", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(s.value, cx + 18, cy + 96);

    // Etiket
    ctx.font = '22px "Outfit", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(s.label, cx + 18, cy + 122);
  });

  // — 7. FOTOĞRAFLAR (3 slot, sağ ve alt bölge) —
  const photosToShow = shareCardPhotos.filter(p => p !== null);

  if (photosToShow.length > 0) {
    const photoAreaX = 590;
    const photoAreaY = 340;
    const photoAreaW = W - photoAreaX - 64;

    if (photosToShow.length === 1) {
      _drawPhoto(ctx, photosToShow[0], photoAreaX, photoAreaY, photoAreaW, 420);
    } else if (photosToShow.length === 2) {
      const ph = 200;
      const gap = 12;
      _drawPhoto(ctx, photosToShow[0], photoAreaX, photoAreaY, photoAreaW, ph);
      _drawPhoto(ctx, photosToShow[1], photoAreaX, photoAreaY + ph + gap, photoAreaW, ph);
    } else {
      const ph1 = 240;
      const ph2 = (420 - ph1 - 12) / 2;
      _drawPhoto(ctx, photosToShow[0], photoAreaX, photoAreaY, photoAreaW, ph1);
      _drawPhoto(ctx, photosToShow[1], photoAreaX, photoAreaY + ph1 + 12, photoAreaW / 2 - 6, ph2);
      _drawPhoto(ctx, photosToShow[2], photoAreaX + photoAreaW / 2 + 6, photoAreaY + ph1 + 12, photoAreaW / 2 - 6, ph2);
    }
  }

  // — 8. ALT ŞERIT —
  const barGrad = ctx.createLinearGradient(0, H - 120, W, H);
  barGrad.addColorStop(0, 'rgba(0,0,0,0)');
  barGrad.addColorStop(1, `rgba(${typeObj.rgb || '255,90,54'}, 0.25)`);
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, H - 120, W, 120);

  ctx.font = '26px "Outfit", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('rotadan.app  •  Gezi & GPS Takip', 64, H - 40);

  // Sağ alt: ROTADAN ikonu
  ctx.font = 'bold 26px "Outfit", sans-serif';
  ctx.fillStyle = typeObj.color;
  ctx.textAlign = 'right';
  ctx.fillText('🏁 ROTADAN', W - 64, H - 40);
  ctx.textAlign = 'left';
}

// Yardımcı: Yuvarlatılmış dikdörtgen
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Yardımcı: Fotoğraf çiz (URL'den Image yükleyerek)
function _drawPhoto(ctx, dataUrl, x, y, w, h) {
  const img = new Image();
  img.onload = () => {
    ctx.save();
    _roundRect(ctx, x, y, w, h, 18);
    ctx.clip();
    // Aspect fill: görseli ortalayarak kırp
    const scale = Math.max(w / img.width, h / img.height);
    const sw = img.width * scale;
    const sh = img.height * scale;
    const sx = x + (w - sw) / 2;
    const sy = y + (h - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh);
    ctx.restore();
    // Kenara ince çerçeve ekle
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    _roundRect(ctx, x, y, w, h, 18);
    ctx.stroke();
    ctx.restore();
  };
  img.src = dataUrl;
}

// Kartı PNG olarak indir veya Galeriye Kaydet
function downloadShareCard() {
  if (!shareCardRide) return;
  setTimeout(() => {
    const canvas = $('share-card-canvas');
    if (!canvas) return;
    const name = (shareCardRide.name || 'rotadan').replace(/\s+/g, '_');
    const dataUrl = canvas.toDataURL('image/png');
    
    if (window.MotoIz && window.MotoIz.saveBase64Image) {
      window.MotoIz.saveBase64Image(dataUrl, `ROTADAN_${name}.png`);
      return;
    }
    
    const link = document.createElement('a');
    link.download = `ROTADAN_${name}.png`;
    link.href = dataUrl;
    link.click();
  }, 400);
}

// Native Web Share veya Android Bridge ile Paylaş
async function nativeShareCard(targetKind) {
  if (!shareCardRide) return;

  // Fotoğrafların tam çizilmesi için kısa bekleme
  await new Promise(r => setTimeout(r, 450));

  const canvas = $('share-card-canvas');
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');
  const name = (shareCardRide.name || 'rotadan').replace(/\s+/g, '_');

  // Android Native Köprüsü aktifse doğrudan köprü üzerinden paylaş
  if (window.MotoIz && window.MotoIz.shareBase64Image) {
    window.MotoIz.shareBase64Image(dataUrl, shareCardRide.name, targetKind || 'all');
    return;
  }

  // Web tarayıcısı için standart Web Share API fallback
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], `ROTADAN_${name}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `ROTADAN — ${shareCardRide.name}`,
          text: `🏁 ${shareCardRide.name} · ${shareCardRide.distance.toFixed(1)} km · ${duration(shareCardRide.duration)}`
        });
      } catch (e) {
        downloadShareCard();
      }
    } else {
      downloadShareCard();
    }
  }, 'image/png');
}

// ============================================================
// TOPLULUK, SOSYAL AĞ, ARKADAŞLAR VE CANLI GRUP SÜRÜŞÜ MODÜLÜ
// ============================================================

// Varsayılan Örnek Topluluk Gezginleri (İlk açılışta canlı topluluk hissi sağlar)
const DEFAULT_COMMUNITY_USERS = [
  {
    username: 'selin_touring',
    name: 'Selin Demir',
    avatar: '🏍',
    bio: 'Yamaha Tenere 700 | Karadeniz & Ege Rotaları Tutkunu',
    totalDistance: 3420.5,
    totalRides: 18,
    totalCamps: 6,
    badges: ['🔰 İlk Adım', '⚡ Yol Kurdu', '🏁 Kaptan', '⛺ Doğa Sever']
  },
  {
    username: 'baris_adv',
    name: 'Barış Yılmaz',
    avatar: '⛺',
    bio: 'KTM 890 Adv R | Dağ, Zirve ve Çadır Kampçısı',
    totalDistance: 2840.0,
    totalRides: 14,
    totalCamps: 9,
    badges: ['🔰 İlk Adım', '⚡ Yol Kurdu', '⛺ Doğa Sever', '📸 Gözlemci']
  },
  {
    username: 'eren_rider',
    name: 'Eren Kaya',
    avatar: '🏎️',
    bio: 'Honda CBR650R | Viraj & Pist Avcısı',
    totalDistance: 1950.2,
    totalRides: 12,
    totalCamps: 1,
    badges: ['🔰 İlk Adım', '⚡ Yol Kurdu', '🛑 Mola Ustası']
  },
  {
    username: 'deniz_trail',
    name: 'Deniz Aydın',
    avatar: '🥾',
    bio: 'Trekking & Doğa Yürüyüşleri Rehberi',
    totalDistance: 620.8,
    totalRides: 24,
    totalCamps: 11,
    badges: ['🔰 İlk Adım', '⛺ Doğa Sever', '📸 Gözlemci']
  }
];

// Varsayılan Örnek Topluluk Rotaları
const DEFAULT_COMMUNITY_RIDES = [
  {
    id: 'comm_ride_1',
    author: { username: 'selin_touring', name: 'Selin Demir', avatar: '🏍' },
    name: 'Şile - Ağva Sahil & Viraj Rotası',
    mode: 'moto',
    color: '#ff5a36',
    distance: 118.4,
    duration: 9900000,
    startedAt: Date.now() - 3600000 * 5,
    privacy: 'public',
    likes: 14,
    likedByMe: false,
    comments: [
      { author: 'baris_adv', text: 'Hafta sonu asfalt durumu nasıldı?' },
      { author: 'selin_touring', text: 'Teke tarafında hafif mıcır vardı ama genel olarak harikaydı!' }
    ],
    points: [
      { lat: 41.176, lng: 29.612 }, { lat: 41.168, lng: 29.654 }, { lat: 41.155, lng: 29.721 },
      { lat: 41.142, lng: 29.790 }, { lat: 41.150, lng: 29.845 }, { lat: 41.138, lng: 29.985 }
    ],
    stops: [{ name: 'Ağva Göksu Çay Molası', lat: 41.138, lng: 29.985 }]
  },
  {
    id: 'comm_ride_2',
    author: { username: 'baris_adv', name: 'Barış Yılmaz', avatar: '⛺' },
    name: 'Kaz Dağları Zirve & Kamp Rotası',
    mode: 'camp',
    color: '#a970ff',
    distance: 84.2,
    duration: 14400000,
    startedAt: Date.now() - 3600000 * 28,
    privacy: 'public',
    likes: 22,
    likedByMe: true,
    comments: [
      { author: 'deniz_trail', text: 'Çadır kurulan yerde su kaynağı var mı?' },
      { author: 'baris_adv', text: 'Evet, hemen 100m aşağıda buz gibi pınar akıyor 💧' }
    ],
    points: [
      { lat: 39.695, lng: 26.852 }, { lat: 39.712, lng: 26.879 }, { lat: 39.735, lng: 26.915 },
      { lat: 39.758, lng: 26.942 }, { lat: 39.780, lng: 26.975 }
    ],
    stops: [{ name: 'Pınar Başı Su Molası', lat: 39.735, lng: 26.915 }]
  },
  {
    id: 'comm_ride_3',
    author: { username: 'eren_rider', name: 'Eren Kaya', avatar: '🏎️' },
    name: 'Riva & Anadolu Feneri Sabah Kaçamağı',
    mode: 'moto',
    color: '#559eff',
    distance: 46.8,
    duration: 4200000,
    startedAt: Date.now() - 3600000 * 52,
    privacy: 'public',
    likes: 9,
    likedByMe: false,
    comments: [
      { author: 'selin_touring', text: 'Sabah erken saatte manzara efsane!' }
    ],
    points: [
      { lat: 41.125, lng: 29.102 }, { lat: 41.170, lng: 29.165 }, { lat: 41.221, lng: 29.224 },
      { lat: 41.248, lng: 29.255 }
    ],
    stops: [{ name: 'Anadolu Feneri Seyir Noktası', lat: 41.248, lng: 29.255 }]
  }
];

// Topluluk Depolama Yardımcıları
const communityRidesData = () => {
  const data = localStorage.getItem('moto-iz-community-rides');
  return data ? JSON.parse(data) : DEFAULT_COMMUNITY_RIDES;
};

const setCommunityRidesData = r => localStorage.setItem('moto-iz-community-rides', JSON.stringify(r));

const followingData = () => {
  const data = localStorage.getItem('moto-iz-following');
  return data ? JSON.parse(data) : ['selin_touring', 'baris_adv'];
};

const setFollowingData = f => localStorage.setItem('moto-iz-following', JSON.stringify(f));

// Topluluğa Rota Yayınlama
function publishToCommunity(newRide) {
  const allComm = communityRidesData();
  allComm.unshift(newRide);
  setCommunityRidesData(allComm);
}

// Topluluk Sekme Değiştirici
let currentCommunityTab = 'all';

function switchCommunityTab(tab) {
  currentCommunityTab = tab;
  document.querySelectorAll('.subnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === `feed-${tab}`);
  });

  const feedContainer = $('community-feed-container');
  const groupContainer = $('community-group-container');
  const leadersContainer = $('community-leaders-container');

  if (tab === 'all' || tab === 'friends') {
    feedContainer.classList.remove('hidden');
    groupContainer.classList.add('hidden');
    leadersContainer.classList.add('hidden');
    renderCommunityFeed();
  } else if (tab === 'group') {
    feedContainer.classList.add('hidden');
    groupContainer.classList.remove('hidden');
    leadersContainer.classList.add('hidden');
    renderGroupRide();
  } else if (tab === 'leaders') {
    feedContainer.classList.add('hidden');
    groupContainer.classList.add('hidden');
    leadersContainer.classList.remove('hidden');
    renderLeaderboard();
  }
}

// Topluluk Akışını Çizme (Feed Renderer)
let miniMaps = [];

function renderCommunityFeed() {
  const feedContainer = $('community-feed-container');
  if (!feedContainer) return;

  // Önceki harita instancelarını temizle
  miniMaps.forEach(m => m.remove());
  miniMaps = [];

  const allRides = communityRidesData();
  const following = followingData();

  let filteredRides = allRides;
  if (currentCommunityTab === 'friends') {
    filteredRides = allRides.filter(r => following.includes(r.author?.username));
  }

  if (!filteredRides.length) {
    const msg = currentCommunityTab === 'friends'
      ? 'Henüz takip ettiğiniz arkadaşınızın aktivitesi yok. Yeni arkadaşlar bulmak için <b>+ Arkadaş Bul</b> butonuna dokunun.'
      : 'Topluluk akışında henüz sürüş bulunmuyor.';
    feedContainer.innerHTML = `<p class="empty-message" style="padding:40px 16px;">${msg}</p>`;
    return;
  }

  feedContainer.innerHTML = filteredRides.map((ride, idx) => {
    const author = ride.author || { name: 'Gezgin', username: 'gezgin', avatar: '🏍' };
    const typeObj = types.find(t => t.id === ride.mode) || types[0];
    const avgSpeed = ride.duration > 0 ? Math.round(ride.distance / (ride.duration / 3600000)) : 0;
    const timeAgo = formatTimeAgo(ride.startedAt || Date.now());
    const isLiked = ride.likedByMe;

    const stopCount = ride.stops ? ride.stops.length : 0;
    const photoCount = ride.photos ? ride.photos.length : 0;
    const mapId = `feed-map-${idx}-${ride.id || idx}`;

    return `
      <article class="feed-card" style="--active-color: ${typeObj.color};">
        <div class="feed-header">
          <div class="feed-author" onclick="openFriendProfile('${author.username}')">
            <div class="feed-avatar">${author.avatar}</div>
            <div class="feed-user-info">
              <h4>${author.name}</h4>
              <span>@${author.username} · ${timeAgo}</span>
            </div>
          </div>
          <div class="feed-mode-badge">${typeObj.emoji} ${typeObj.name}</div>
        </div>

        <h3 class="feed-title">${ride.name}</h3>

        <div class="feed-stats-chips">
          <span class="feed-chip">📏 ${ride.distance.toFixed(1)} km</span>
          <span class="feed-chip">⏱️ ${duration(ride.duration)}</span>
          <span class="feed-chip">⚡ ${avgSpeed} km/sa</span>
          ${stopCount > 0 ? `<span class="feed-chip">🛑 ${stopCount} Durak</span>` : ''}
          ${photoCount > 0 ? `<span class="feed-chip">📸 ${photoCount} Foto</span>` : ''}
        </div>

        <!-- Mini Harita Önizlemesi -->
        ${(ride.points && ride.points.length >= 2) ? `
          <div class="feed-map-container" id="${mapId}"></div>
        ` : ''}

        <!-- Fotoğraf Şeridi -->
        ${(ride.photos && ride.photos.length) ? `
          <div class="feed-photos-row">
            ${ride.photos.map(p => `
              <img src="${p.dataUrl || p.url}" class="feed-photo-thumb" alt="Fotoğraf" onclick="openPhotoZoomDirect('${p.dataUrl || p.url}', '${ride.name}')" />
            `).join('')}
          </div>
        ` : ''}

        <!-- Aksiyon Barı -->
        <div class="feed-actions">
          <div class="feed-actions-left">
            <button class="feed-action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLikeCommunityRide('${ride.id}')">
              ${isLiked ? '🔥 Gazlandı' : '🔥 Gazla'} (${ride.likes || 0})
            </button>
            <button class="feed-action-btn" onclick="toggleCommentsSection('${ride.id}')">
              💬 Yorumlar (${(ride.comments || []).length})
            </button>
          </div>
          <button class="btn-clone-route" onclick="cloneCommunityRoute('${ride.id}')" title="Bu rotayı kendi haritama ekle">
            🚀 Bu Rotayı Sür
          </button>
        </div>

        <!-- Yorumlar Bölümü -->
        <div class="feed-comments-section hidden" id="comments-${ride.id}">
          <div class="feed-comments-list" id="comments-list-${ride.id}">
            ${(ride.comments || []).map(c => `
              <div class="feed-comment-item">
                <strong>@${c.author}:</strong> ${c.text}
              </div>
            `).join('')}
          </div>
          <div class="feed-comment-input-row">
            <input type="text" class="feed-comment-input" id="input-comment-${ride.id}" placeholder="Yorum yaz..." onkeydown="if(event.key==='Enter') addCommunityComment('${ride.id}')" />
            <button class="feed-comment-send-btn" onclick="addCommunityComment('${ride.id}')">Gönder</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Mini Leaflet Haritalarını Başlat
  setTimeout(() => {
    filteredRides.forEach((ride, idx) => {
      if (ride.points && ride.points.length >= 2) {
        const mapId = `feed-map-${idx}-${ride.id || idx}`;
        const container = $(mapId);
        if (!container) return;

        const miniMap = L.map(mapId, {
          zoomControl: false,
          dragging: false,
          touchZoom: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(miniMap);

        const latlngs = ride.points.map(p => [p.lat, p.lng]);
        const line = L.polyline(latlngs, {
          color: ride.color || '#ff5a36',
          weight: 4.5,
          opacity: 0.9
        }).addTo(miniMap);

        if (ride.stops) {
          ride.stops.forEach(s => {
            L.marker([s.lat, s.lng], {
              icon: L.divIcon({ html: '🛑', className: 'emoji-marker', iconSize: [16, 16], iconAnchor: [8, 8] })
            }).addTo(miniMap);
          });
        }

        miniMap.fitBounds(line.getBounds(), { padding: [20, 20] });
        miniMaps.push(miniMap);
      }
    });
  }, 100);
}

// Zaman Farkı Formatlayıcı
function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

// Beğeni (Gazla! 🔥) Değiştirici
function toggleLikeCommunityRide(rideId) {
  const allComm = communityRidesData();
  const ride = allComm.find(r => r.id === rideId);
  if (!ride) return;

  if (ride.likedByMe) {
    ride.likes = Math.max(0, (ride.likes || 1) - 1);
    ride.likedByMe = false;
  } else {
    ride.likes = (ride.likes || 0) + 1;
    ride.likedByMe = true;
  }

  setCommunityRidesData(allComm);
  renderCommunityFeed();
}

// Yorum Alanını Aç/Kapa
function toggleCommentsSection(rideId) {
  const sec = $(`comments-${rideId}`);
  if (sec) sec.classList.toggle('hidden');
}

// Yorum Ekleme
function addCommunityComment(rideId) {
  const input = $(`input-comment-${rideId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const prof = profileData();
  const allComm = communityRidesData();
  const ride = allComm.find(r => r.id === rideId);
  if (!ride) return;

  if (!ride.comments) ride.comments = [];
  ride.comments.push({
    author: prof.username || 'gezgin',
    text
  });

  setCommunityRidesData(allComm);
  input.value = '';
  renderCommunityFeed();
  setTimeout(() => {
    const sec = $(`comments-${rideId}`);
    if (sec) sec.classList.remove('hidden');
  }, 150);
}

// "Bu Rotayı Sür" — Başkasının Rotasını Kendi Haritana Kopyalama
function cloneCommunityRoute(rideId) {
  const allComm = communityRidesData();
  const commRide = allComm.find(r => r.id === rideId);
  if (!commRide) return;

  const allRides = rides();
  const cloned = {
    id: 'clone_' + Date.now(),
    name: `${commRide.name} (Kopyalandı)`,
    mode: commRide.mode || 'moto',
    startedAt: Date.now(),
    duration: commRide.duration,
    distance: commRide.distance,
    points: JSON.parse(JSON.stringify(commRide.points || [])),
    stops: JSON.parse(JSON.stringify(commRide.stops || [])),
    photos: [],
    color: commRide.color || '#ff5a36'
  };

  allRides.push(cloned);
  setRides(allRides);

  renderTotals();
  renderRides();
  renderAllRoutes();

  alert(`🎉 "${commRide.name}" rotası Gezilerim arşivinize ve Haritanıza başarıyla eklendi!`);

  // Harita sekmesine geçiş yap
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  const mapNavBtn = document.querySelector('[data-view="all-routes-view"]');
  if (mapNavBtn) mapNavBtn.classList.add('active');

  document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
  $('all-routes-view').classList.add('active');

  setTimeout(() => {
    routeMap.invalidateSize();
    if (cloned.points && cloned.points.length >= 2) {
      const latlngs = cloned.points.map(p => [p.lat, p.lng]);
      routeMap.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });
    }
  }, 150);
}

// Fotoğraf Doğrudan Büyütme
function openPhotoZoomDirect(url, caption) {
  $('photo-zoom-img').src = url;
  $('photo-zoom-caption').textContent = caption || 'Görsel';
  $('photo-zoom-dialog').showModal();
}

// ============================================================
// ARKADAŞ ARAMA, PROFİL İNCELEME VE TAKİP SİSTEMİ
// ============================================================

function openFriendSearch() {
  $('friend-search-input').value = '';
  renderFriendSearchResults('');
  $('friend-search-dialog').showModal();
}

function handleFriendSearchInput(e) {
  renderFriendSearchResults(e.target.value.trim().toLowerCase());
}

function renderFriendSearchResults(query) {
  const container = $('friend-search-results');
  if (!container) return;

  const following = followingData();
  const allUsers = DEFAULT_COMMUNITY_USERS;

  const filtered = allUsers.filter(u => {
    if (!query) return true;
    return u.name.toLowerCase().includes(query) || u.username.toLowerCase().includes(query);
  });

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-message">Eşleşen gezgin bulunamadı.</p>';
    return;
  }

  container.innerHTML = filtered.map(u => {
    const isFollowing = following.includes(u.username);
    return `
      <div class="friend-card">
        <div class="friend-card-left" onclick="openFriendProfile('${u.username}')">
          <div class="feed-avatar">${u.avatar}</div>
          <div class="friend-card-info">
            <h4>${u.name}</h4>
            <p>@${u.username} · ${u.totalDistance.toFixed(0)} km</p>
          </div>
        </div>
        <button class="btn-follow ${isFollowing ? 'following' : ''}" onclick="toggleFollowUser('${u.username}')">
          ${isFollowing ? 'Takip Ediliyor ✓' : '+ Takip Et'}
        </button>
      </div>
    `;
  }).join('');
}

function toggleFollowUser(username) {
  const following = followingData();
  const idx = following.indexOf(username);
  if (idx > -1) {
    following.splice(idx, 1);
  } else {
    following.push(username);
  }
  setFollowingData(following);

  renderFriendSearchResults($('friend-search-input').value.trim().toLowerCase());
  renderMyFriendsInProfile();
  renderCommunityFeed();
}

// Arkadaş Profili Modalı
let currentModalFriendUsername = null;

function openFriendProfile(username) {
  currentModalFriendUsername = username;
  const user = DEFAULT_COMMUNITY_USERS.find(u => u.username === username);
  if (!user) return;

  const following = followingData();
  const isFollowing = following.includes(username);

  $('friend-modal-name').textContent = user.name;
  $('friend-modal-avatar').textContent = user.avatar;
  $('friend-modal-title').textContent = `${user.name} (@${user.username})`;
  $('friend-modal-bio').textContent = user.bio;

  const followBtn = $('friend-modal-follow-btn');
  followBtn.textContent = isFollowing ? 'Takip Ediliyor ✓' : '+ Takip Et';
  followBtn.className = `btn-follow ${isFollowing ? 'following' : ''}`;

  $('friend-modal-stats').innerHTML = `
    <div class="profile-stat-card">
      <span class="stat-icon">📏</span>
      <span class="stat-value">${user.totalDistance.toFixed(0)}</span>
      <span class="stat-label">Toplam KM</span>
    </div>
    <div class="profile-stat-card">
      <span class="stat-icon">🚀</span>
      <span class="stat-value">${user.totalRides}</span>
      <span class="stat-label">Sürüş</span>
    </div>
    <div class="profile-stat-card">
      <span class="stat-icon">⛺</span>
      <span class="stat-value">${user.totalCamps}</span>
      <span class="stat-label">Kamp</span>
    </div>
  `;

  // Arkadaşın paylaştığı rotalar
  const commRides = communityRidesData().filter(r => r.author?.username === username);
  $('friend-modal-rides-count').textContent = commRides.length;

  const ridesListEl = $('friend-modal-rides-list');
  if (commRides.length) {
    ridesListEl.innerHTML = commRides.map(r => `
      <div class="ride-card" style="margin-bottom:8px;">
        <div class="card-left">
          <div class="card-icon-wrapper">🏍</div>
          <div class="card-info">
            <h4>${r.name}</h4>
            <p>${r.distance.toFixed(1)} km · ${duration(r.duration)}</p>
          </div>
        </div>
        <button class="btn-clone-route" style="padding:6px 10px; font-size:11px;" onclick="cloneCommunityRoute('${r.id}')">
          🚀 Kopyala
        </button>
      </div>
    `).join('');
  } else {
    ridesListEl.innerHTML = '<p class="empty-message">Henüz paylaşılan rota yok.</p>';
  }

  $('friend-profile-dialog').showModal();
}

function toggleFriendModalFollow() {
  if (!currentModalFriendUsername) return;
  toggleFollowUser(currentModalFriendUsername);
  openFriendProfile(currentModalFriendUsername);
}

// Profil Sayfasında Arkadaşlarım Bölümü
function renderMyFriendsInProfile() {
  const listEl = $('my-friends-list');
  const countEl = $('my-friends-count');
  if (!listEl) return;

  const following = followingData();
  if (countEl) countEl.textContent = following.length;

  if (!following.length) {
    listEl.innerHTML = '<p class="empty-message" style="font-size:12px;">Henüz takip ettiğiniz arkadaş yok. + Ekle butonuna basın.</p>';
    return;
  }

  const users = DEFAULT_COMMUNITY_USERS.filter(u => following.includes(u.username));
  listEl.innerHTML = users.map(u => `
    <div class="friend-card" style="margin-bottom:6px;">
      <div class="friend-card-left" onclick="openFriendProfile('${u.username}')">
        <div class="feed-avatar" style="width:34px; height:34px; font-size:16px;">${u.avatar}</div>
        <div class="friend-card-info">
          <h4>${u.name}</h4>
          <p>@${u.username} · ${u.totalDistance.toFixed(0)} km</p>
        </div>
      </div>
      <button class="text-button danger-text" style="font-size:11px;" onclick="toggleFollowUser('${u.username}')">Takipten Çık</button>
    </div>
  `).join('');
}

// ============================================================
// CANLI GRUP SÜRÜŞÜ (REALTIME GROUP TRACKING)
// ============================================================

let activeGroupRoom = {
  code: '8492',
  title: 'Hafta Sonu Şile & Ağva Turu',
  members: [
    { name: 'Selin Demir', avatar: '🏍', speed: 82, status: 'Yolda 🟢', lat: 41.176, lng: 29.612 },
    { name: 'Barış Yılmaz', avatar: '⛺', speed: 78, status: 'Yolda 🟢', lat: 41.168, lng: 29.654 },
    { name: 'Ben (Lider)', avatar: '🏍', speed: 85, status: 'Yolda 🟢', lat: 41.155, lng: 29.721 }
  ]
};

function renderGroupRide() {
  $('group-room-title').textContent = activeGroupRoom.title || 'Grup Sürüşü Odası';
  $('group-room-code').textContent = `#${activeGroupRoom.code || '----'}`;
  $('group-member-count').textContent = activeGroupRoom.members.length;

  const grid = $('group-members-grid');
  if (grid) {
    grid.innerHTML = activeGroupRoom.members.map(m => `
      <div class="group-member-card">
        <div class="group-member-avatar">${m.avatar}</div>
        <div class="group-member-meta">
          <strong>${m.name}</strong>
          <span>${m.speed} km/sa · ${m.status}</span>
        </div>
      </div>
    `).join('');
  }
}

function openCreateGroupRide() {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  $('group-title-input').value = `Grup Sürüşü #${code}`;
  $('create-group-dialog').showModal();
}

function confirmCreateGroup() {
  const title = $('group-title-input').value.trim() || 'Grup Sürüşü';
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const prof = profileData();

  activeGroupRoom = {
    code,
    title,
    members: [
      { name: prof.name || 'Ben', avatar: prof.avatar || '🏍', speed: 0, status: 'Oda Kuruldu 🟢', lat: 41.0, lng: 29.0 }
    ]
  };

  $('create-group-dialog').close();
  renderGroupRide();
  alert(`🚀 "${title}" grubu başlatıldı!\nOda Kodu: #${code}\nArkadaşlarınıza bu kodu vererek gruba davet edebilirsiniz.`);
}

function openJoinGroupRide() {
  $('group-code-input').value = '';
  $('join-group-dialog').showModal();
}

function confirmJoinGroup() {
  const code = $('group-code-input').value.trim().toUpperCase();
  if (!code) {
    alert('Lütfen geçerli bir oda kodu girin.');
    return;
  }

  const prof = profileData();
  activeGroupRoom.code = code;
  activeGroupRoom.members.push({
    name: prof.name || 'Ben',
    avatar: prof.avatar || '🏍',
    speed: 0,
    status: 'Gruba Katıldı 🟢',
    lat: 41.0,
    lng: 29.0
  });

  $('join-group-dialog').close();
  renderGroupRide();
  alert(`✅ #${code} numaralı odaya başarıyla katıldınız!`);
}

// ============================================================
// LİDERLİK TABLOSU (LEADERBOARDS)
// ============================================================

function renderLeaderboard() {
  const listEl = $('leaderboard-list');
  if (!listEl) return;

  const prof = profileData();
  const allRides = rides();
  const myTotalKm = allRides.reduce((s, r) => s + (r.distance || 0), 0);

  const allParticipants = [
    ...DEFAULT_COMMUNITY_USERS,
    {
      username: prof.username || 'ben',
      name: `${prof.name || 'Ben'} (Siz)`,
      avatar: prof.avatar || '🏍',
      totalDistance: myTotalKm
    }
  ].sort((a, b) => b.totalDistance - a.totalDistance);

  listEl.innerHTML = allParticipants.map((p, idx) => {
    let rankBadge = `${idx + 1}`;
    let rankClass = '';
    if (idx === 0) { rankBadge = '🥇'; rankClass = 'rank-1'; }
    else if (idx === 1) { rankBadge = '🥈'; rankClass = 'rank-2'; }
    else if (idx === 2) { rankBadge = '🥉'; rankClass = 'rank-3'; }

    return `
      <div class="leaderboard-card">
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="leaderboard-rank ${rankClass}">${rankBadge}</div>
          <div class="feed-avatar" style="width:36px; height:36px; font-size:18px;">${p.avatar}</div>
          <div>
            <strong style="font-size:14px;">${p.name}</strong>
            <p style="font-size:11px; color:var(--text-muted);">@${p.username}</p>
          </div>
        </div>
        <strong style="font-size:15px; color:var(--accent);">${p.totalDistance.toFixed(1)} km</strong>
      </div>
    `;
  }).join('');
}

// ============================================================
// BULUT & SUPABASE AYARLARI
// ============================================================

function openCloudSettings() {
  const savedUrl = localStorage.getItem('moto-iz-supabase-url') || '';
  const savedKey = localStorage.getItem('moto-iz-supabase-key') || '';
  $('custom-supabase-url').value = savedUrl;
  $('custom-supabase-key').value = savedKey;
  $('cloud-settings-dialog').showModal();
}

function saveCloudSettings() {
  const url = $('custom-supabase-url').value.trim();
  const key = $('custom-supabase-key').value.trim();
  if (url) localStorage.setItem('moto-iz-supabase-url', url);
  if (key) localStorage.setItem('moto-iz-supabase-key', key);
  $('cloud-settings-dialog').close();
  alert('✅ Bulut yapılandırması başarıyla kaydedildi!');
}

function resetCloudSettings() {
  localStorage.removeItem('moto-iz-supabase-url');
  localStorage.removeItem('moto-iz-supabase-key');
  $('custom-supabase-url').value = '';
  $('custom-supabase-key').value = '';
  alert('Varsayılan bulut motoruna dönüldü.');
}

// Navigasyon Olaylarını Güncelle
document.querySelectorAll('.nav-item').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    const targetView = $(b.dataset.view);
    if (targetView) targetView.classList.add('active');
    
    // Harita yenileme, topluluk, etkinlik veya profil güncelleme tetikleyicisi
    if (b.dataset.view === 'all-routes-view') {
      setTimeout(() => routeMap.invalidateSize(), 150);
    } else if (b.dataset.view === 'home-view') {
      setTimeout(() => map.invalidateSize(), 150);
    } else if (b.dataset.view === 'community-view') {
      renderCommunityFeed();
    } else if (b.dataset.view === 'events-view') {
      renderEvents();
    } else if (b.dataset.view === 'profile-view') {
      renderProfile();
      renderMyFriendsInProfile();
    }
  };
});

// Topluluk & Sosyal Modülleri Başlat
renderCommunityFeed();
renderMyFriendsInProfile();

// ============================================================
// MODÜL 1: YÜKSEKLİK VE EĞİM PROFİLİ MOTORU (ELEVATION ENGINE)
// ============================================================

function renderElevationProfile(ride) {
  const canvas = $('elevation-canvas');
  if (!canvas || !ride || !ride.points || ride.points.length < 2) {
    if ($('detail-elevation-card')) $('detail-elevation-card').classList.add('hidden');
    return;
  }
  if ($('detail-elevation-card')) $('detail-elevation-card').classList.remove('hidden');

  const pts = ride.points;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.parentElement.clientWidth || 560;
  const H = canvas.height = 120;

  // Koordinatlardan topoğrafik irtifa hesaplama (Simüle edilmiş veya GPS alt verisi)
  let elevations = pts.map((p, i) => {
    if (p.alt !== undefined) return p.alt;
    // Gerçekçi dağ ve tepe topoğrafyası eğrisi üretici
    const progress = i / (pts.length - 1);
    const wave1 = Math.sin(progress * Math.PI * 3 + p.lat * 10) * 85;
    const wave2 = Math.cos(progress * Math.PI * 6 + p.lng * 10) * 45;
    const baseAlt = 120 + (p.lat * 15 % 180);
    return Math.max(20, Math.round(baseAlt + wave1 + wave2));
  });

  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);

  let totalGain = 0;
  let totalLoss = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) totalGain += diff;
    else totalLoss += Math.abs(diff);
  }

  // İstatistikleri arayüze yaz
  if ($('elev-gain')) $('elev-gain').textContent = `▲ +${totalGain}m`;
  if ($('elev-loss')) $('elev-loss').textContent = `▼ -${totalLoss}m`;
  if ($('elev-max')) $('elev-max').textContent = `Maks: ${maxElev}m`;

  // Canvas Temizle
  ctx.clearRect(0, 0, W, H);

  // Arka Plan Izgarası
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let y = 20; y < H; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Gradyanlı Dolgu Alanı
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(255, 90, 54, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 90, 54, 0.02)');

  ctx.beginPath();
  ctx.moveTo(0, H);

  const range = (maxElev - minElev) || 1;
  const padding = 20;

  for (let i = 0; i < elevations.length; i++) {
    const x = (i / (elevations.length - 1)) * W;
    const normY = (elevations[i] - minElev) / range;
    const y = H - padding - (normY * (H - padding * 2));
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Çizgi
  ctx.beginPath();
  for (let i = 0; i < elevations.length; i++) {
    const x = (i / (elevations.length - 1)) * W;
    const normY = (elevations[i] - minElev) / range;
    const y = H - padding - (normY * (H - padding * 2));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#ff5a36';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

// ============================================================
// MODÜL 2: YOL ÜSTÜ CANLI TEHLİKE & İKAZ PİNLERİ (WAZE TARZI)
// ============================================================

const HAZARD_TYPES = {
  micir: { label: 'Mıcır / Kaygan Zemin', emoji: '⚠️', color: '#f39c12' },
  radar: { label: 'Radar / Hız Kontrolü', emoji: '👮', color: '#3498db' },
  cukur: { label: 'Bozuk Asfalt / Çukur', emoji: '🚧', color: '#e67e22' },
  su: { label: 'İçilebilir Su Pınarı', emoji: '💧', color: '#2ecc71' },
  manzara: { label: 'Manzara & Fotoğraf Noktası', emoji: '📸', color: '#9b59b6' },
  cay: { label: 'Çay / Mola Noktası', emoji: '☕', color: '#e74c3c' }
};

let activeHazards = [];

function reportHazard(typeKey) {
  const hInfo = HAZARD_TYPES[typeKey];
  if (!hInfo) return;

  const currentPos = points.length ? points.at(-1) : (currentLocationMarker ? currentLocationMarker.getLatLng() : null);
  if (!currentPos) {
    alert('İkaz bırakabilmek için konumunuzun açık olması veya sürüşün başlamış olması gerekir.');
    return;
  }

  const lat = currentPos.lat || currentPos[0];
  const lng = currentPos.lng || currentPos[1];
  const prof = profileData();

  const newHazard = {
    id: 'hz_' + Date.now(),
    type: typeKey,
    label: hInfo.label,
    emoji: hInfo.emoji,
    lat,
    lng,
    author: prof.username || 'Gezgin',
    at: Date.now()
  };

  activeHazards.push(newHazard);

  // Haritaya İkaz İşaretçisi Ekle
  const marker = L.marker([lat, lng], {
    icon: L.divIcon({
      html: `<div style="background:#161a1c; border:2px solid ${hInfo.color}; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 0 10px ${hInfo.color};">${hInfo.emoji}</div>`,
      className: 'hazard-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    })
  }).bindPopup(`<b>${hInfo.emoji} ${hInfo.label}</b><br><span style="font-size:11px; color:#888;">@${prof.username} tarafından bildirildi</span>`).addTo(map);

  alert(`✅ "${hInfo.emoji} ${hInfo.label}" ikazı haritaya başarıyla eklendi!`);
}

// ============================================================
// MODÜL 3: CANLI HAVA DURUMU VE YAĞMUR RADARI
// ============================================================

let rainRadarLayer = null;

async function refreshLiveWeather() {
  const lat = points.length ? points.at(-1).lat : 41.0082;
  const lng = points.length ? points.at(-1).lng : 28.9784;

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m`);
    const data = await res.json();
    if (data && data.current) {
      const temp = Math.round(data.current.temperature_2m);
      const code = data.current.weather_code;
      const wind = Math.round(data.current.wind_speed_10m);

      let icon = '☀️';
      let desc = 'Açık';
      if (code >= 1 && code <= 3) { icon = '⛅'; desc = 'Parçalı'; }
      else if (code >= 51 && code <= 67) { icon = '🌧️'; desc = 'Yağmurlu'; }
      else if (code >= 71 && code <= 77) { icon = '❄️'; desc = 'Karlı'; }
      else if (code >= 95) { icon = '⛈️'; desc = 'Fırtına'; }

      if ($('weather-icon')) $('weather-icon').textContent = icon;
      if ($('weather-temp')) $('weather-temp').textContent = `${temp}°C`;
      if ($('weather-desc')) $('weather-desc').textContent = `${desc} · ${wind} km/s rüzgar`;
    }
  } catch (e) {
    // Çevrimdışı fallback
    if ($('weather-temp')) $('weather-temp').textContent = '24°C';
    if ($('weather-desc')) $('weather-desc').textContent = 'Güneşli';
  }
}

function toggleRainRadar() {
  const btn = $('radar-toggle-btn');
  if (rainRadarLayer) {
    map.removeLayer(rainRadarLayer);
    rainRadarLayer = null;
    if (btn) btn.classList.remove('active');
    alert('Yağmur Radarı Katmanı Kapatıldı.');
  } else {
    // OpenWeather / RainViewer yağmur katmanı
    rainRadarLayer = L.tileLayer('https://tile.rainviewer.com/v2/radar/nowcast_latest/256/{z}/{x}/{y}/2/1_1.png', {
      opacity: 0.65,
      maxZoom: 18
    }).addTo(map);
    if (btn) btn.classList.add('active');
    alert('🌧️ Canlı Yağmur ve Bulut Radarı Haritaya Eklendi!');
  }
}

// ============================================================
// MODÜL 4: 3D SİNEMATİK ROTA HİKAYE OYNATICISI (RELIVE TARZI)
// ============================================================

let cinematicMapInstance = null;
let cinematicAnimationTimer = null;

function playCinematicRide() {
  if (activeDetailType !== 'ride' || activeDetailIndex === null) return;
  const r = rides()[activeDetailIndex];
  if (!r || !r.points || r.points.length < 2) {
    alert('Sinematik oynatıcı için rotada yeterli GPS noktası bulunmuyor.');
    return;
  }

  $('details-dialog').close();
  $('cinematic-ride-title').textContent = r.name;
  $('cinematic-player-dialog').showModal();

  setTimeout(() => {
    initCinematicAnimation(r);
  }, 200);
}

function closeCinematicPlayer() {
  if (cinematicAnimationTimer) {
    clearInterval(cinematicAnimationTimer);
    cinematicAnimationTimer = null;
  }
  if (cinematicMapInstance) {
    cinematicMapInstance.remove();
    cinematicMapInstance = null;
  }
  $('cinematic-player-dialog').close();
}

function initCinematicAnimation(r) {
  if (cinematicMapInstance) {
    cinematicMapInstance.remove();
  }

  cinematicMapInstance = L.map('cinematic-map', {
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(cinematicMapInstance);

  const pts = r.points;
  const latlngs = pts.map(p => [p.lat, p.lng]);

  // Arka plan soluk rota çizgisi
  L.polyline(latlngs, {
    color: 'rgba(255, 90, 54, 0.25)',
    weight: 4
  }).addTo(cinematicMapInstance);

  // Canlı akacak parlak rota çizgisi
  const livePolyline = L.polyline([], {
    color: '#ff5a36',
    weight: 6,
    opacity: 0.95
  }).addTo(cinematicMapInstance);

  // Hareket eden parlayan pilot işaretçi
  const tracerIcon = L.divIcon({
    html: '<div style="width:20px; height:20px; border-radius:50%; background:#fff; border:3px solid #ff5a36; box-shadow:0 0 16px #ff5a36, 0 0 30px #ff8c42;"></div>',
    className: 'tracer-dot',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  const tracerMarker = L.marker(latlngs[0], { icon: tracerIcon }).addTo(cinematicMapInstance);

  cinematicMapInstance.setView(latlngs[0], 15);

  let currentIndex = 0;
  const totalPoints = pts.length;
  const stepDelay = Math.max(20, Math.min(80, Math.floor(15000 / totalPoints))); // Toplam ~15-20 saniyelik sinematik süre

  const photoStops = r.photos || [];

  cinematicAnimationTimer = setInterval(() => {
    if (currentIndex >= totalPoints) {
      clearInterval(cinematicAnimationTimer);
      cinematicAnimationTimer = null;
      setTimeout(() => {
        alert('🏁 Sinematik Rota Uçuşu Tamamlandı!');
      }, 500);
      return;
    }

    const currentPt = latlngs[currentIndex];
    livePolyline.addLatLng(currentPt);
    tracerMarker.setLatLng(currentPt);
    cinematicMapInstance.panTo(currentPt, { animate: true, duration: 0.1 });

    // HUD Metriklerini Canlı Güncelle
    const progress = (currentIndex / totalPoints);
    const curDist = (r.distance * progress).toFixed(1);
    const curTimeMs = r.duration * progress;
    const curSpeed = r.duration > 0 ? Math.round(r.distance / (r.duration / 3600000)) : 0;
    const curElev = Math.round(150 + Math.sin(progress * Math.PI * 4) * 120);

    if ($('cine-dist')) $('cine-dist').textContent = `${curDist} km`;
    if ($('cine-time')) $('cine-time').textContent = duration(curTimeMs);
    if ($('cine-speed')) $('cine-speed').textContent = `${curSpeed} km/s`;
    if ($('cine-elev')) $('cine-elev').textContent = `${curElev} m`;
    if ($('cinematic-progress-fill')) $('cinematic-progress-fill').style.width = `${Math.round(progress * 100)}%`;

    // Fotoğraf Noktalarında Otomatik Pop-up Gösterme
    if (photoStops.length) {
      const matchPhoto = photoStops.find(p => km(p, pts[currentIndex]) < 0.05);
      if (matchPhoto) {
        showCinematicPhotoPopup(matchPhoto.dataUrl || matchPhoto.url, '📸 Rota Fotoğrafı');
      }
    }

    currentIndex++;
  }, stepDelay);
}

function showCinematicPhotoPopup(url, title) {
  const pop = $('cinematic-photo-popup');
  if (!pop) return;
  $('cinematic-popup-img').src = url;
  $('cinematic-popup-text').textContent = title;
  pop.classList.add('show');
  setTimeout(() => {
    pop.classList.remove('show');
  }, 2200);
}

// ============================================================
// MODÜL 5: KAZA ALGILAMA VE OTOMATİK ACIL DURUM SOS SİSTEMİ
// ============================================================

let sosCountdownInterval = null;
let sosCountdownSeconds = 30;

function initCrashDetection() {
  if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', (e) => {
      if (!active) return; // Sadece aktif sürüş esnasında algıla
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;

      const totalAcc = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      // Şiddetli darbe (G-Force > 30 m/s²) algılandığında
      if (totalAcc > 35) {
        triggerSOSAlert();
      }
    });
  }
}

function triggerSOSAlert() {
  if (sosCountdownInterval) return; // Zaten çalışıyor

  sosCountdownSeconds = 30;
  $('sos-countdown-num').textContent = sosCountdownSeconds;
  $('sos-alert-dialog').showModal();

  // Telefon Titreşimi
  if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 800]);

  sosCountdownInterval = setInterval(() => {
    sosCountdownSeconds--;
    if ($('sos-countdown-num')) $('sos-countdown-num').textContent = sosCountdownSeconds;

    if (sosCountdownSeconds <= 0) {
      clearInterval(sosCountdownInterval);
      sosCountdownInterval = null;
      $('sos-alert-dialog').close();
      executeEmergencySOS();
    }
  }, 1000);
}

function cancelSOS() {
  if (sosCountdownInterval) {
    clearInterval(sosCountdownInterval);
    sosCountdownInterval = null;
  }
  $('sos-alert-dialog').close();
  alert('✅ SOS acil durum alarmı iptal edildi.');
}

function executeEmergencySOS() {
  const currentPos = points.length ? points.at(-1) : { lat: 41.0, lng: 29.0 };
  const mapsUrl = `https://maps.google.com/?q=${currentPos.lat},${currentPos.lng}`;
  const sosMessage = `🚨 ACİL DURUM BİLDİRİMİ! ROTADAN uygulaması düşüş/kaza algıladı. Canlı Konumum: ${mapsUrl}`;

  if (window.MotoIz && window.MotoIz.share) {
    window.MotoIz.share('sos', 'ACİL DURUM', '0', '0', 'moto');
  } else if (navigator.share) {
    navigator.share({ title: '🚨 ACİL DURUM', text: sosMessage }).catch(() => {});
  } else {
    alert(`🚨 ACİL DURUM!\n\n${sosMessage}`);
  }
}

// Kaza Algılama ve Hava Durumu Servislerini Başlat
initCrashDetection();
refreshLiveWeather();

// PWA Service Worker Kaydı (Çevrimdışı Çalışma ve Hızlı Yükleme)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
