<div dir="rtl">

## 🇮🇷 دارینو {{TAG}} — مدیریت دخل‌وخرج شخصی، کاملاً آفلاین

### تازه در نسخه ۳.۳.۱

- 🔊 **اعلام صوتی واریز حالا واقعاً حرف می‌زند** — پیش‌تر فقط زنگ پخش می‌شد و بعد سکوت؛ اتصال گوینده با پروتکل جدید مایکروسافت بازنویسی شد و امضای زمانی (`Sec-MS-GEC`) هم به‌روز شد
- 📴 **صدا برای همیشه، حتی بدون اینترنت** — ۱۵۶ کلیپ عصبی فارسی (`fa-IR-DilaraNeural` و `fa-IR-FaridNeural`) از قبل ساخته و داخل اپ بسته‌بندی شده‌اند؛ اگر اینترنت نبود یا شبکه WebSocket را بست، همان جمله از روی همین کلیپ‌ها چیده و خوانده می‌شود
- 🧩 **چیدن طبیعی جمله** — عدد، «و»، «هزار»، «میلیون» و «تومن برات واریز شد» با همان لحن محاوره‌ای و بدون مکث شنیده می‌شود
- 📱 **پخش درست روی گوشی و ماشین** — صدا با مسیر «رسانه/گفتار» و فوکوس موقت پخش می‌شود (موسیقی و مسیریاب کم می‌شوند) و تا پایان جمله wake lock نگه داشته می‌شود
- 🗣️ **آخرین سنگر: فینگلیسی** — اگر هیچ‌کدام از دو مسیر بالا ممکن نبود، جمله به حروف لاتین نوشته و با صدای انگلیسی خوانده می‌شود تا هرگز سکوت مطلق نباشد
- 🧪 **دکمه‌ی تست صادق** — تست تنظیمات فقط بعد از پایان پخش پاسخ می‌دهد و اگر صدا پخش نشد، «ناموفق» گزارش می‌کند
- 🎙️ **دو صدا (زن/مرد)**، **زنگ کوتاه اختیاری**، **خواندن نام واریزکننده** و **کلید مستقل برای هر کارت** مثل قبل
- 🚫 **بدون اعلام اشتباه** — برداشت، رمز پویا و پیامک تبلیغاتی هرگز صدا نمی‌دهند

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

### New in 3.3.1

- 🔊 **The deposit announcer actually speaks now** — it used to play only the chime and then go silent; the neural voice connection was rewritten against Microsoft’s current WebSocket protocol with the current `Sec-MS-GEC` token
- 📴 **Speech that works offline** — 156 pre-generated Persian neural clips (`fa-IR-DilaraNeural` and `fa-IR-FaridNeural`) are bundled in the APK, so a blocked or missing network still produces the same natural sentence
- 🧩 **Natural sentence stitching** — numbers, “و”, “هزار”, “میلیون” and “تومن برات واریز شد” are joined seamlessly in the same casual tone
- 📱 **Audible on the phone and in the car** — playback uses the media/speech route with transient audio focus (music and navigation duck) and holds a wake lock until the sentence ends
- 🗣️ **Last resort: Finglish** — if neither path works, the sentence is transliterated and spoken with the English voice, so silence is never the outcome
- 🧪 **An honest test button** — the settings test only answers after playback and reports failure instead of pretending success
- 🎙️ **Two voices (female/male)**, **optional chime**, **payer-name detection** and **per-card switches** as before
- 🚫 **No false announcements** — withdrawals, OTPs and promotional SMS never speak

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
