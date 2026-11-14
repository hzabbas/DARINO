<div dir="rtl">

## 🇮🇷 دارینو {{TAG}} — مدیریت دخل‌وخرج شخصی، کاملاً آفلاین

### تازه در نسخه ۳.۵.۰

- 🔢 **مبلغ‌ها حالا درست و طبیعی گفته می‌شوند** — «۷۰٬۰۰۰» می‌شود «هفتاد»، «۱۲۰٬۰۰۰» می‌شود «صد و بیست»، «۱۵۰٬۰۰۰» می‌شود «صد و پنجاه» و «۲۵۰٬۰۰۰» می‌شود «دویست و پنجاه». اگر باقی‌مانده‌ای باشد، «هزار و» سر جایش می‌ماند: «۱۲۵٬۵۰۰» → «صد و بیست و پنج هزار و پونصد». مبلغ‌های میلیونی هم کامل خوانده می‌شوند: «۱٬۲۰۰٬۰۰۰» → «یک میلیون و دویست هزار». همین قاعده روی هر سه مسیر صوتی (آنلاین، کلیپ آفلاین و گوینده‌ی گوشی) یکسان است
- 🎙️ **یک جمله‌ی کامل، در یک نفس** — مسیر پیش‌فرض حالا صدای عصبی فارسی مایکروسافت (زن/مرد) است و کل جمله را یک‌جا می‌سازد؛ دیگر بین کلمه‌ها مکث رباتی و شکاف شنیده نمی‌شود. موتور آواکور و نصب دستی‌اش کامل حذف شد و تنظیم قدیمی‌اش خودکار به «صدای عصبی آنلاین» تبدیل می‌شود
- 🧪 **تست واقعی، حتی بدون اینترنت** — دکمه‌ی «تست صدای گوینده» جمله را از همان قالب و با همان سرعت در لایه‌ی بومی می‌سازد؛ اگر اینترنت نبود، نمونه‌ی یک‌نفس «علی محمدی، هفتاد تومن برات واریز کرد» پخش می‌شود، نه کلیپ‌های تکه‌تکه
- 🛡️ **اعلام واریز حتی وقتی اپ بسته است** — یک سرویس پیش‌زمینه‌ی سبک با اعلان بی‌صدا، هم گیرنده‌ی پیامک و هم صندوق ورودی پیامک را زیر نظر دارد؛ اگر شیائومی/سامسونگ گیرنده را خواباند، مسیر دوم همان واریز را می‌گیرد و به‌خاطر کلید ضدتکرار دقیقاً یک‌بار گفته می‌شود
- 🔁 **بعد از بوت و به‌روزرسانی، خودش برمی‌گردد** — سرویس با روشن شدن گوشی و بعد از نصب نسخه‌ی جدید دوباره بالا می‌آید و با کنار زدن اپ از «برنامه‌های اخیر» هم با یک آلارم کوتاه برمی‌گردد
- ⚡ **راهنمای کارکرد دائمی** — اگر اندروید دارینو را از بهینه‌سازی باتری معاف نکرده باشد، در تنظیمات بنر «فعال‌سازی کارکرد دائمی در پس‌زمینه (جلوگیری از بسته شدن در شیائومی/اندروید)» با دکمه‌ی مستقیم به صفحه‌ی معافیت نشان داده می‌شود؛ مجوز نمایش اعلان هم همان لحظه‌ی روشن کردن اعلام صوتی گرفته می‌شود
- ✍️ **جمله‌ی فارسی، توکن فارسی** — جای نام، مبلغ، بانک و کارت را با `{نام}`، `{مبلغ}`، `{مبلغ_رقمی}`، `{بانک}` و `{کارت}` بگذار؛ مثل «{نام}، {مبلغ} تومن برات واریز کرد». جمله‌های ذخیره‌شده‌ی نسخه‌های قبل (`{name}`، `{amount}`، …) خودکار مهاجرت می‌کنند
- ↔️ **راست‌به‌چپ، تمام‌عیار** — عنوان‌ها، توضیح‌ها، کادر پیش‌نمایش و فیلدها در تنظیمات، حساب‌های بانکی و فرم تراکنش با جهت راست‌به‌چپ و چیدمان درست فارسی نمایش داده می‌شوند
- 🚫 **بدون اعلام اشتباه** — برداشت، رمز پویا و پیامک تبلیغاتی هرگز صدا نمی‌دهند؛ تطبیق کارت هم سخاوتمندانه‌تر شد تا واریز کارت‌به‌کارت بدون سرشماره‌ی بانکی از دست نرود
- 🎙️ **دو صدا (زن/مرد)**، **زنگ کوتاه اختیاری** و **کلید مستقل برای هر کارت** مثل قبل

### نصب

| فایل | مناسب برای |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | گوشی‌های اندروید امروزی (پیشنهاد اول) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | گوشی‌های قدیمی‌تر ۳۲ بیتی |
| `Darino-{{TAG}}-universal.apk` | اگر هیچ‌کدام از دو فایل بالا نصب نشد |

پس از نصب، در «تنظیمات → حساب‌های بانکی و پیامک‌خوان» حساب بساز و اجازه‌ی خواندن پیامک را بده.
برای اعلام صوتی، در همان صفحه کلید 🔊 کارت را روشن کن و در «تنظیمات → اعلام صوتی واریز وجه» جمله و سرعت صدا را تنظیم کن.
اگر بنر «فعال‌سازی کارکرد دائمی در پس‌زمینه» را دیدی، دکمه‌اش را بزن تا شیائومی/سامسونگ سرویس را نکشد.
پیامک‌ها روی گوشی تحلیل می‌شوند؛ فقط اگر سرویس «صدای عصبی آنلاین» را انتخاب کنی، همان یک جمله‌ی کوتاه برای ساخت صدا به اینترنت می‌رود و هیچ داده‌ی مالی دیگری ارسال نمی‌شود.

**فهرست تغییرات:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

</div>

---

## 🇬🇧 Darino {{TAG}} — offline personal finance app

### New in 3.5.0

- 🔢 **Amounts are read correctly and naturally** — 70,000 becomes “هفتاد”, 120,000 becomes “صد و بیست”, 150,000 becomes “صد و پنجاه”, and 250,000 becomes “دویست و پنجاه”. When there is a remainder, “هزار و” stays: 125,500 → “صد و بیست و پنج هزار و پونصد”. Millions are read in full: 1,200,000 → “یک میلیون و دویست هزار”. The same rule applies on all three speech paths (online, offline clips and phone TTS)
- 🎙️ **One complete sentence, one breath** — the default path is now Microsoft’s Persian neural voice (female/male), synthesizing the whole sentence at once; the robotic pauses and gaps between words are gone. AvaCore and its manual install were removed entirely, and the old stored setting migrates to the online neural voice automatically
- 🧪 **A real test, even offline** — the “Test voice” button renders the sentence from your own template at your chosen rate in the native layer; when the network is unavailable, the bundled one-breath sample “علی محمدی، هفتاد تومن برات واریز کرد” plays instead of stitched clips
- 🛡️ **Announcements while the app is closed** — a lightweight foreground service with a silent notification watches both the SMS broadcast and the SMS inbox; if Xiaomi/Samsung puts the receiver to sleep, the second path still catches the deposit, and a strict dedupe key guarantees exactly one announcement
- 🔁 **Comes back after boot and updates** — the service restarts when the phone boots, after installing a new version, and even when the app is swiped from recents, via a short AlarmManager restart
- ⚡ **Background permanence help** — when Android has not exempted Darino from battery optimization, Settings shows a banner: “فعال‌سازی کارکرد دائمی در پس‌زمینه (جلوگیری از بسته شدن در شیائومی/اندروید)” with a button that opens the exemption screen directly; the notification permission is requested at the moment voice announcements are enabled
- ✍️ **Persian sentence, Persian tokens** — place the payer, amount, bank and card with `{نام}`, `{مبلغ}`, `{مبلغ_رقمی}`, `{بانک}` and `{کارت}`; for example “{نام}، {مبلغ} تومن برات واریز کرد”. Templates stored by older versions (`{name}`, `{amount}`, …) migrate automatically
- ↔️ **Right-to-left, done properly** — titles, hints, the preview box and inputs in Settings, Bank accounts and the transaction form are all right-to-left with correct Persian layout
- 🚫 **No false announcements** — withdrawals, OTPs and promotional SMS never speak; card matching is now more forgiving so a card-to-card deposit without a bank sender is still announced
- 🎙️ **Two voices (female/male)**, **optional chime** and **per-card switches** as before

### Install

| File | Use |
| --- | --- |
| `Darino-{{TAG}}-arm64-v8a.apk` | Current Android phones (recommended) |
| `Darino-{{TAG}}-armeabi-v7a.apk` | Older 32-bit phones |
| `Darino-{{TAG}}-universal.apk` | Fallback if neither build installs |

After installing, open Settings → Bank accounts & SMS reader, add an account and grant the SMS read
permission. For voice announcements, enable the 🔊 switch on a card and set the sentence and rate in
Settings → Deposit voice announcer.
If you see the “background permanence” banner, tap it so Xiaomi/Samsung does not kill the service.
SMS is parsed on the device; only if you pick the online neural voice does that one short sentence
reach the internet to synthesize audio, with no other financial data sent.

**What's changed:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

---

**Developed by Abbas Hz** · [github.com/hzabbas/DARINO](https://github.com/hzabbas/DARINO)
