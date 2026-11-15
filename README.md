# Lesbos onay API'si

## Kurulum
```
npm install
cp .env.example .env     # değerleri doldurun
node --env-file=.env server.js
```
Node 20.6+ için `--env-file` çalışır. Daha eski sürümde değişkenleri hosting panelinden verin.
Herkese açık bir adreste (Render, Railway, Fly.io, VPS...) yayınlayın. HTTPS zorunlu. Yerel deneme için Cloudflare Tunnel veya ngrok kullanabilirsiniz.

## Uç noktalar
| Yöntem | Yol | Kim çağırır | Ne yapar |
|---|---|---|---|
| POST | /api/requests | Site | Talebi `pending` kaydeder, Make webhook'una bildirim yollar |
| GET | /api/requests/:id | Site | Durumu döner (`pending`, `approved`, `rejected`) |
| POST | /api/approve | Make.com HTTP modülü | Durumu `approved` (veya `rejected`) yapar |

## Make.com senaryosu
Senaryo 1: Custom webhook -> Telegram "mesaj gönder" (Onayla / Reddet satır içi butonları; callback verisi: `approve:{{requestId}}` ve `reject:{{requestId}}`).
Senaryo 2: Telegram callback (buton basışı) -> Router -> HTTP "Make a request":
- URL: https://<alan-adınız>/api/approve
- Method: POST
- Header: `x-api-key` = APPROVE_API_KEY
- Body type: Raw, JSON
- Body: `{"requestId":"<callback verisinden gelen id>","status":"approved"}`
Reddet kolu için `status` değeri `rejected`.

Modül adları Make arayüzünde değişebilir; Telegram Bot modüllerinden butonlu mesaj ve callback izleme seçeneklerini kullanın.

## Test
```
curl -X POST https://<alan-adınız>/api/requests -H "Content-Type: application/json" \
  -d '{"userName":"MaviKelebek_34","expertName":"Av. Selin Yılmaz","type":"randevu","details":"Cuma 15:00"}'

curl -X POST https://<alan-adınız>/api/approve -H "Content-Type: application/json" \
  -H "x-api-key: <APPROVE_API_KEY>" -d '{"requestId":"<yukarıdaki id>","status":"approved"}'
```
