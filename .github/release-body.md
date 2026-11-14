<div dir="rtl">

## 🇮🇷 دارینو {{TAG}} — مدیریت دخل‌وخرج شخصی، کاملاً آفلاین

### تازه در نسخه ۳.۲

- 💰 **موجودی دیگر درآمد نیست** — «موجودی کل» فقط از موجودی حساب‌های بانکی و خالص تراکنش‌های نقدی ساخته می‌شود؛ درآمد و هزینه فقط از تراکنش‌های واقعی همان دوره
- 🏦 **موجودی اولیه فقط روی حساب بانکی** — دیگر هیچ تراکنش «درآمدِ» ساختگی برای موجودی اولیه ساخته نمی‌شود و اعداد قبلی هم دوباره شمرده نمی‌شوند
- 🧹 **حذف کلید «احتساب موجودی در درآمد»** — این تنظیم گیج‌کننده از داشبورد و تنظیمات برداشته شد
- 📩 **بدون پیامک تکراری** — یک پیامک که هم گیرنده و هم صندوق پیامک می‌بینند فقط یک‌بار ثبت می‌شود
- 🕒 **مهر زمانی خود بانک** — زمان پیامک از خود حامل خوانده می‌شود و مانده‌ی قدیمی‌تر موجودی تازه را به عقب برنمی‌گرداند
- 🔁 **ویرایش و حذف امن** — تغییر یا حذف تراکنش، اثر قبلی‌اش روی موجودی را برمی‌گرداند و اثر تازه را اعمال می‌کند
- ⌨️ **رفع دوباره‌ی افتادن کیبورد** در اندروید و باز شدن درست پنجره‌ها روی کیبورد
- ✂️ **متن‌های بلند در راست‌به‌چپ** با «…» کوتاه می‌شوند و چیدمان را به‌هم نمی‌ریزند
- 🗓️ **مرز روزهای شمسی درست شد** — تراکنش‌های نیمه‌شب تا ۳:۳۰ بامداد به روز اشتباه نمی‌روند
- 🧩 **یکپارچه‌سازی کد** — تقویم شمسی، بازه‌های گزارش و همگام‌سازی پیامک در یک مسیر واحد و بدون کد مرده

### نصب

| فایل | مناسب برای |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | گوشی‌های اندروید امروزی (پیشنهاد اول) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | گوشی‌های قدیمی‌تر ۳۲ بیتی |
| `Darino-{{TAG}}-universal.apk` | اگر هیچ‌کدام از دو فایل بالا نصب نشد |

پس از نصب، در «تنظیمات → حساب‌های بانکی و پیامک‌خوان» حساب بساز و اجازه‌ی خواندن پیامک را بده.
همه‌چیز روی گوشی تحلیل می‌شود و هیچ داده‌ای به اینترنت نمی‌رود.

**فهرست تغییرات:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

</div>

---

## 🇬🇧 Darino {{TAG}} — offline personal finance app

### New in 3.2

- 💰 **Balance is no longer income** — total balance comes only from bank accounts plus net cash transactions; income and expense come only from real transactions in the selected period
- 🏦 **Opening balance lives on the account** — no more fake income rows for an initial balance, and old rows are no longer double-counted
- 🧹 **"Count bank balance as income" removed** — the confusing switch is gone from the dashboard and settings
- 📩 **No duplicate SMS** — a message seen by both the receiver and the inbox is stored once
- 🕒 **Carrier timestamp** — the message time comes from the PDU itself, and an older balance can no longer roll a newer one back
- 🔁 **Safe edits and deletes** — editing or deleting a transaction reverses its old balance effect and applies the new one
- ⌨️ **Android keyboard overlap fixed again** and modals stay above the keyboard
- ✂️ **RTL truncation** — long labels end with "…" instead of breaking the layout
- 🗓️ **Correct Jalali day boundaries** — transactions between midnight and 03:30 no longer land on the wrong day
- 🧩 **Consolidated internals** — one Jalali calendar, one range helper and one SMS sync path, with dead code removed

### Install

| File | Use |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | Current Android phones (recommended) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | Older 32-bit phones |
| `Darino-{{TAG}}-universal.apk` | Fallback if neither build installs |

After installing, open Settings → Bank accounts & SMS reader, add an account and grant the SMS read
permission. Everything is parsed on the device; nothing is uploaded.

**What's changed:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

---

**Developed by Abbas Hz** · [github.com/hzabbas/DARINO](https://github.com/hzabbas/DARINO)
