# ROTADAN Dağıtım Rehberi

Bu dosya, uygulamayı ücretsiz bir Vercel linki üzerinden hem Android hem iPhone kullanıcılarına nasıl dağıtacağınızı açıklar.

## Adım 1 — GitHub Hesabı Aç (Ücretsiz)
- github.com adresine git, ücretsiz hesap oluştur.
- "New Repository" > Ad: `rotadan` > Public > Create.

## Adım 2 — Projeyi GitHub'a Yükle
Terminalden (ya da GitHub Desktop uygulamasından):
```
git init
git remote add origin https://github.com/KULLANICI_ADIN/rotadan.git
git add .
git commit -m "ROTADAN v1.0.4"
git push origin main
```

## Adım 3 — Vercel'e Bağla (Ücretsiz & Otomatik Güncelleme)
1. vercel.com adresine git, GitHub hesabınla ücretsiz giriş yap.
2. "Add New Project" > GitHub'daki `rotadan` reposunu seç > Deploy.
3. Vercel sana şöyle bir link verir: `rotadan.vercel.app`

## Adım 4 — Kişisel Domain (Opsiyonel)
Vercel panelinde "Domains" sekmesinden `rotadan.app` gibi kendi alan adını ekleyebilirsin.

## Güncelleme Yapmak
Her değişiklikten sonra sadece şunu çalıştır:
```
git add .
git commit -m "güncelleme açıklaması"
git push origin main
```
Vercel otomatik olarak yeni sürümü canlıya alır. Link değişmez!

## Paylaşılacak Tek Link
`https://rotadan.vercel.app` (ya da kendi domain adın)
Bu link;
- Android kullanıcısına APK indirir.
- iPhone kullanıcısına "Ana Ekrana Ekle" adımlarını gösterir.
- Masaüstü kullanıcısına QR kod gösterir.
