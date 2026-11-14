<div dir="rtl">

## 🇮🇷 دارینو {{TAG}} — مدیریت دخل‌وخرج شخصی، کاملاً آفلاین

### تازه در نسخه ۳.۳

- 🔊 **اعلام صوتی واریز (حالت رانندگی)** — وقتی پول به کارتی که انتخاب کرده‌ای برسد، مبلغ با صدای طبیعی و جمله‌ی خودمانی گفته می‌شود؛ حتی وقتی دارینو بسته است و صفحه خاموش است
- 🗣️ **لحن محاوره‌ای، نه بانکی** — «علی محمدی، هفتاد تومن برات واریز کرد»؛ بدون «هزار» اضافه، با «صد» و «پونصد» و «تومن»
- 🧑‍💼 **خواندن نام واریزکننده** — نام از متن پیامک اکثر بانک‌ها بیرون کشیده می‌شود؛ اگر نامی نبود، جمله بدون نام گفته می‌شود
- 🎙️ **دو صدا** — گوینده‌ی زن و مرد طبیعی، با پشتوانه‌ی گوینده‌ی آفلاین خود گوشی وقتی اینترنت نیست
- 🔔 **زنگ کوتاه اختیاری** پیش از اعلام، تا وسط موسیقی یا مسیریاب گم نشود
- 🚫 **بدون اعلام اشتباه** — برداشت، رمز پویا و پیامک تبلیغاتی هرگز صدا نمی‌دهند
- 🃏 **کلید مستقل برای هر کارت** — اعلام صوتی فقط برای همان کارت‌هایی که خودت روشن کرده‌ای
- 🧪 **دکمه‌ی تست صدای گوینده** در تنظیمات، برای شنیدن جمله‌ی نمونه پیش از رفتن روی جاده
- 💾 **پشتیبان‌گیری از حساب‌های بانکی** — حساب‌ها هم به فایل پشتیبان اضافه شدند و هنگام بازیابی برمی‌گردند

### نصب

| فایل | مناسب برای |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | گوشی‌های اندروید امروزی (پیشنهاد اول) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | گوشی‌های قدیمی‌تر ۳۲ بیتی |
| `Darino-{{TAG}}-universal.apk` | اگر هیچ‌کدام از دو فایل بالا نصب نشد |

پس از نصب، در «تنظیمات → حساب‌های بانکی و پیامک‌خوان» حساب بساز و اجازه‌ی خواندن پیامک را بده.
برای اعلام صوتی، در همان صفحه کلید 🔊 کارت را روشن کن و در «تنظیمات → اعلام صوتی واریز وجه» صدا را امتحان کن.
پیامک‌ها روی گوشی تحلیل می‌شوند؛ فقط همان یک جمله‌ی کوتاه برای گوینده‌ی طبیعی به اینترنت می‌رود و هیچ داده‌ی مالی دیگری ارسال نمی‌شود.

**فهرست تغییرات:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

</div>

---

## 🇬🇧 Darino {{TAG}} — offline personal finance app

### New in 3.3

- 🔊 **Deposit voice announcer (driving mode)** — when money lands in a card you picked, the amount is spoken in a natural voice, even while Darino is closed and the screen is off
- 🗣️ **Casual spoken Persian, not bank language** — “علی محمدی، هفتاد تومن برات واریز کرد”; no extra “thousand”, with colloquial “صد”, “پونصد” and “تومن”
- 🧑‍💼 **Payer name detection** — the sender’s name is extracted from most Iranian bank SMS formats; without a name the sentence simply omits it
- 🎙️ **Two voices** — natural female and male, backed by the phone’s offline TTS when there is no internet
- 🔔 **Optional short chime** before the announcement so it is not lost under music or navigation
- 🚫 **No false announcements** — withdrawals, OTPs and promotional SMS never speak
- 🃏 **Per-card switch** — announcements only for the cards you enable
- 🧪 **Test voice button** in settings to hear the sample sentence before hitting the road
- 💾 **Bank accounts in backups** — accounts are now included in the backup file and restored with it

### Install

| File | Use |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | Current Android phones (recommended) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | Older 32-bit phones |
| `Darino-{{TAG}}-universal.apk` | Fallback if neither build installs |

After installing, open Settings → Bank accounts & SMS reader, add an account and grant the SMS read
permission. For voice announcements, enable the 🔊 switch on a card and try the voice from
Settings → Deposit voice announcer. SMS is parsed on the device; only that short sentence reaches the
natural-voice service, and no other financial data is sent.

**What's changed:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

---

**Developed by Abbas Hz** · [github.com/hzabbas/DARINO](https://github.com/hzabbas/DARINO)
