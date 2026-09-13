# E-emlak

Emlak otomasyonu projesi. maviLojistik'in altyapı iskeletinden (WhatsApp/Baileys köprüsü, mobil yönetim paneli çatısı, PM2 process yönetimi) fork edilmiştir — lojistiğe özgü iş mantığı (kasa eşleştirme, kara liste, gönderim akışları) taşınmamıştır; bu proje sıfırdan emlak alanına özel geliştirilecektir.

## İçerik

- `sidecar/` — WhatsApp bağlantısını Baileys ile kuran Node.js köprüsü (QR ile giriş, grup mesajlarını bir webhook'a POST eder).
- `src/api/admin_panel.py` — Flask tabanlı, servis durumu ve log görüntüleme için minimal bir mobil yönetim paneli iskeleti.
- `ecosystem.config.js` — PM2 process tanımları.
- `.env.example` — gerekli ortam değişkenlerinin şablonu.

## Kurulum

```bash
# Python tarafı
python -m venv .venv
./.venv/bin/pip install -r requirements.txt

# Sidecar (Node.js)
cd sidecar
npm install
node connect.js   # QR kod ile WhatsApp'a bağlan
```

`.env.example` dosyasını `.env` olarak kopyalayıp kendi değerlerinizi girin.

## Durum

Bu repo yeni başlatıldı — emlak ilanı takibi, mesaj ayrıştırma ve müşteri eşleştirme gibi iş mantığı henüz eklenmedi.
