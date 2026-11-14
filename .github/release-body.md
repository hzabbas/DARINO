<div dir="rtl">

## 🇮🇷 دارینو {{TAG}} — مدیریت دخل‌وخرج شخصی، کاملاً آفلاین

### تازه در نسخه ۳.۴.۰

- 🔌 **آواکور، گوینده‌ی پیش‌فرض** — اعلام واریز حالا با موتور مستقل [AvaCore](https://github.com/PlayFoundryHQ/AvaCore) خوانده می‌شود: فارسیِ گفتاری، کاملاً روی گوشی و بدون هیچ مجوز اینترنتی. دارینو موتور را از قبل گرم می‌کند تا لحظه‌ی رسیدن پیامک، جمله بدون مکث گفته شود
- 📥 **نصب و بررسی موتور، داخل اپ** — تنظیمات وضعیت نصب و نسخه‌ی آواکور را نشان می‌دهد، دکمه‌ی نصب و «بررسی دوباره» دارد و با برگشتن از مرورگر خودش تازه می‌شود
- ✍️ **جمله را خودت بنویس** — جای نام، مبلغ، بانک و کارت را با `{name}`، `{amount}`، `{amountNumber}`، `{bank}` و `{card}` بگذار؛ مثلاً «{name}، {amount} تومن زد به کارتت» یا «{name} {amount} تومن واریز کرد برات». چهار جمله‌ی آماده، پیش‌نمایش زنده و هشدار برای جمله‌ی ناقص
- 🐢 **سرعت و آرامش صدا** — پنج حالت از «آرام‌تر» تا «تندتر» (۰٫۶ تا ۱٫۴ برابر) با همان تنظیم روی هر سه موتور صوتی
- 🎛️ **انتخاب سرویس صوتی** — آواکور (آفلاین، پیش‌فرض) · صدای عصبی آنلاین · کلیپ‌های آفلاین · گوینده‌ی گوشی؛ اگر سرویس اول جواب نداد، زنجیره‌ی جایگزین خودکار ادامه می‌دهد تا اعلام بی‌صدا نماند
- 🧪 **تست صادق** — جمله در لایه‌ی بومی از همان قالب و با همان سرعت ساخته می‌شود، نه یک متن ثابت؛ پس تست دقیقاً همان مسیر پیامک واقعی را می‌رود
- 🎙️ **دو صدا (زن/مرد)**، **زنگ کوتاه اختیاری** و **کلید مستقل برای هر کارت** مثل قبل
- 🚫 **بدون اعلام اشتباه** — برداشت، رمز پویا و پیامک تبلیغاتی هرگز صدا نمی‌دهند
- 🧹 **سبک‌تر** — کلیپ‌های بی‌استفاده‌ی تست از بسته‌ی اپ حذف شدند

### نصب

| فایل | مناسب برای |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | گوشی‌های اندروید امروزی (پیشنهاد اول) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | گوشی‌های قدیمی‌تر ۳۲ بیتی |
| `Darino-{{TAG}}-universal.apk` | اگر هیچ‌کدام از دو فایل بالا نصب نشد |

پس از نصب، در «تنظیمات → حساب‌های بانکی و پیامک‌خوان» حساب بساز و اجازه‌ی خواندن پیامک را بده.
برای اعلام صوتی، در همان صفحه کلید 🔊 کارت را روشن کن و در «تنظیمات → اعلام صوتی واریز وجه» جمله و سرعت صدا را تنظیم کن.

برای سرویس پیش‌فرض، اپ موتور [آواکور](https://github.com/PlayFoundryHQ/AvaCore/releases/latest) را هم یک‌بار نصب کن (دکمه‌ی «نصب آواکور» همین‌جا فایلش را می‌آورد)؛ بار اول یک‌بار خودش را باز کن تا مدل ۶۳ مگابایتی آماده شود. بعد از آن هیچ اینترنتی لازم نیست.
پیامک‌ها روی گوشی تحلیل می‌شوند؛ آواکور کاملاً آفلاین است و فقط اگر خودت سرویس «صدای عصبی آنلاین» را انتخاب کنی، همان یک جمله‌ی کوتاه به اینترنت می‌رود و هیچ داده‌ی مالی دیگری ارسال نمی‌شود.

**فهرست تغییرات:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

</div>

---

## 🇬🇧 Darino {{TAG}} — offline personal finance app

### New in 3.4.0

- 🔌 **AvaCore is the default voice** — deposit announcements are now spoken by the independent [AvaCore](https://github.com/PlayFoundryHQ/AvaCore) engine: spoken Persian, entirely on-device, with no internet permission at all. Darino warms the engine ahead of time so a deposit is read without a pause
- 📥 **Install and check the engine in-app** — settings show whether AvaCore is installed and which version, with install and re-check buttons that refresh themselves when you come back from the browser
- ✍️ **Write the sentence yourself** — place the payer, amount, bank and card with `{name}`, `{amount}`, `{amountNumber}`, `{bank}` and `{card}`; for example “{name}، {amount} تومن زد به کارتت” or “{name} {amount} تومن واریز کرد برات”. Four ready-made presets, a live preview, and a warning when the sentence is incomplete
- 🐢 **Speech rate** — five steps from “calmer” to “faster” (0.6–1.4×), applied on all three speech engines
- 🎛️ **Pick the voice service** — AvaCore (offline, default) · online neural voice · offline clips · phone TTS; if the first choice fails, the fallback chain continues automatically so an announcement is never silent
- 🧪 **An honest test** — the sample sentence is rendered natively from your own template at your chosen rate, so the test walks the exact path a real SMS takes
- 🎙️ **Two voices (female/male)**, **optional chime** and **per-card switches** as before
- 🚫 **No false announcements** — withdrawals, OTPs and promotional SMS never speak
- 🧹 **Slimmer APK** — unused test clips were dropped from the bundle

### Install

| File | Use |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | Current Android phones (recommended) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | Older 32-bit phones |
| `Darino-{{TAG}}-universal.apk` | Fallback if neither build installs |

After installing, open Settings → Bank accounts & SMS reader, add an account and grant the SMS read
permission. For voice announcements, enable the 🔊 switch on a card and set the sentence and rate in
Settings → Deposit voice announcer.

For the default service, also install the [AvaCore](https://github.com/PlayFoundryHQ/AvaCore/releases/latest)
engine app once (the “Install AvaCore” button downloads it), and open it once so its 63 MB model is
ready. After that it needs no network at all.
SMS is parsed on the device; AvaCore is fully offline, and only if you pick the online neural voice
does that one short sentence reach the internet, with no other financial data sent.

**What's changed:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

---

**Developed by Abbas Hz** · [github.com/hzabbas/DARINO](https://github.com/hzabbas/DARINO)
