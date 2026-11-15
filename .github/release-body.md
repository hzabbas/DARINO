<div dir="rtl">

## 🇮🇷 دارینو {{TAG}} — مدیریت دخل‌وخرج شخصی، کاملاً آفلاین

### تازه در نسخه ۳.۵.۴

- 🎛️ **پنل اختصاصی تنظیمات صدای عصبی روی گوشی (Sherpa-ONNX)** — اضافه شدن پنل شیت اختصاصی و پیشرفته برای شخصی‌سازی کامل صدای مدل آفلاین شامل:
  - **تنظیم دقیق زیروبمی و تـُن صدا (Pitch)**: تغییر بسامد صدا از ۰٫۷۰ تا ۱٫۳۵ با دکمه‌های استپر دقیق و گزینه‌های آماده (خیلی بم، بم، طبیعی، زیر، خیلی زیر، و خودکار بر اساس جنسیت) بدون تغییر در سرعت گفتار
  - **تقویت بلندی صدا (Volume Gain)**: تقویت مستقیم خروجی PCM به مقادیر ۱۰۰٪، ۱۲۵٪ و ۱۵۰٪ برای شنیدن واضح و رسا هنگام رانندگی یا در محیط‌های پرسروصدا
  - **تعداد هسته‌های پردازشی CPU**: انتخاب بین ۱ هسته (کم‌مصرف)، ۲ هسته (متعادل - پیش‌فرض) و ۴ هسته (حداکثر سرعت تولید آفلاین)
  - **انتخاب شناسه گوینده (Speaker ID)**: برای استفاده از گوینده‌های مختلف در مدل‌های چندگوینده
  - **عیب‌یابی، سلامت و استخراج مجدد مدل**: نمایش نام، حجم و وضعیت آماده به کار بودن مدل روی گوشی با امکان بازنشانی و استخراج تمیز مدل در صورت نیاز
  - **دکمه تست زنده در داخل خود پنل**: امکان شنیدن و آزمایش فوری تنظیمات صدا بدون نیاز به بستن پنل

### قابلیت‌های نسخه ۳.۵.۳

- 🎙️ **بازطراحی اساسی تست اعلام صوتی (تست دقیق بدون سقوط خاموش)** — در زمان تست، هر موتور (`local` صدای عصبی آفلاین Sherpa-ONNX، `neural` صدای عصبی آنلاین، `clips` کلیپ‌های آفلاین، `system` گفتار گوشی) مستقیماً با ۶ پارامتر زنده آزمایش می‌شود و در صورت بروز خطا به موتور دیگر سقوط خاموش نمی‌کند تا وضعیت واقعی همان موتور فوراً به کاربر گزارش شود (سقوط به کلیپ آفلاین صرفاً برای پیامک‌های واقعی پس‌زمینه محفوظ است)
- 🔘 **دکمه تست مستقل کنار هر سرویس صوتی** — کنار هر یک از ۴ گزینه‌ی سرویس در تنظیمات، یک دکمه‌ی مجزای «تست صدا» با نشانگر بارگذاری قرار گرفته تا بتوان بدون تغییر سرویس اصلی، کیفیت و جنس صدای هر موتور را با یک لمس مقایسه کرد
- 👩‍🦰👨‍🦱 **تفکیک طبیعی صدای زن و مرد در مدل آفلاین (Sherpa-ONNX)** — موتور پردازش بومی Sherpa علاوه بر انتخاب گوینده، با تنظیم دقیق گام صدا (Pitch: 0.88x برای مرد و 1.12x برای زن) تفکیک واضح و گوش‌نوازی بین صدای زن و مرد ایجاد می‌کند
- ✍️ **پشتیبانی کامل از هرگونه جمله و متن دلخواه کاربر** — کاربر می‌تواند هر متنی را آزادانه (با توکن‌های `{مبلغ}` و `{نام}` یا حتی بدون توکن) بنویسد؛ موتور متن را همان‌طور که هست بدون دستکاری یا بازگشت به متن پیش‌فرض می‌خواند
- ⚡ **دکمه تست یکپارچه و بهینه‌سازی رابط کاربری** — دکمه‌های پراکنده‌ی قبلی با یک دکمه‌ی واحد و تمام‌عرض «تست اعلام صوتی» در انتهای صفحه جایگزین شده‌اند، حالت کلیپ‌های صوتی توضیحات شفاف دارد و فیلدهای ورودی بازخورد آنی می‌دهند

### قابلیت‌های نسخه ۳.۵.۲

- 🗣️ **صدای عصبی فارسی روی خود گوشی** — موتور sherpa-onnx و مدل Piper داخل APK بسته‌بندی شده است؛ جمله‌ی کامل (با نام واریزکننده و هر قالبی که خودت نوشته‌ای) بدون اینترنت و در یک نفس ساخته می‌شود. دیگر برای مبلغ‌های بزرگ و جمله‌های دلخواه به کلیپ‌های تکه‌تکه وابسته نیستی. اولین اعلام چند ثانیه دیرتر شروع می‌شود (بارگذاری مدل) و اگر مدل روی گوشی آماده نشود، اعلام بی‌صدا نمی‌ماند و به کلیپ آفلاین و بعد گوینده‌ی گوشی برمی‌گردد
- 🔢 **باگ مبلغ‌های بالای ۱۰۰ هزار تومان رفع شد** — «۱۰۵٬۰۰۰» → «صد و پنج»، «۱۵۰٬۰۰۰» → «صد و پنجاه»، «۲۵۰٬۰۰۰» → «دویست و پنجاه»، «۵۰۰٬۰۰۰» → «پونصد»، «۸۵۰٬۰۰۰» → «هشتصد و پنجاه» و «۱٬۵۰۰٬۰۰۰» → «یک میلیون و پونصد هزار». قبلاً این مبلغ‌ها ناقص یا با عدد اشتباه خوانده می‌شدند
- ➗ **خواندن دقیق واحد پول** — «۱٬۲۰۰٬۰۰۰ ریال» می‌شود ۱۲۰٬۰۰۰ تومان و «۲٬۵۰۰٬۰۰۰ ریال» می‌شود ۲۵۰٬۰۰۰ تومان. واحد کنار خود عدد اولویت دارد، بعد واحد کل پیامک و در آخر پیش‌فرض «ریال»؛ «تومان/تومن/Toman» و «ریال/Rial/IRR» هر دو شناخته می‌شوند
- 🧹 **جداکننده‌های عجیب مبلغ** — `٬`، `،`، `٫`، `'`، فاصله‌ی بین گروه‌های سه‌رقمی و حتی اسلش (`1/200/000`) همه درست خوانده می‌شوند و دیگر مبلغ را نصفه نمی‌گیرند
- 🎧 **بدون مکث رباتی بین کلیپ‌ها** — کلیپ‌های آفلاین حالا با `MediaPlayer.setNextMediaPlayer` پشت هم زنجیر می‌شوند؛ سیستم کلیپ بعدی را از قبل آماده می‌کند و جمله بدون شکاف پخش می‌شود
- 📱 **زنده‌ماندن اعلام روی اندروید ۱۴ و ۱۵** — نوع سرویس پیش‌زمینه `mediaPlayback` (با پشتیبان `specialUse`)، مجوزهای تازه‌ی اندروید ۱۴، قفل بیداری کوتاه از قبل از خواندن صندوق ورودی تا پایان پخش، و مرز دقیق `_id` به‌جای مهر زمانی؛ دیگر نه سرویس با کنار زدن اپ می‌میرد و نه واریزی در فاصله‌ی خاموشی از دست می‌رود
- ↔️ **راست‌چین کامل در تنظیمات و حساب‌ها** — عنوان‌ها، توضیح‌ها، کادر پیش‌نمایش، چیپ‌ها و دکمه‌های تست حتی وقتی زبان گوشی انگلیسی است راست‌چین می‌مانند
- 🧪 **دو دکمه‌ی تست صدا** — یکی برای مبلغ زیر ۱۰۰ هزار (۷۰ هزار) و یکی برای بالای ۱۰۰ هزار (۱۵۰ هزار) تا هر دو مسیر گفتار را همان‌جا آزمایش کنی

### قابلیت‌های نسخه ۳.۵.۱

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
اگر بنر «فعال‌سازی کارکرد دائمی در پس‌زمینه» را دیدی، دکمه‌اش را بزن تا شیائومی/سامسونگ سرویس را نکشد؛
در بخش اعلام صوتی هم «اجرای خودکار در شیائومی/اندروید» را بزن و دارینو را در «برنامه‌های اخیر» قفل کن.
پیامک‌ها روی گوشی تحلیل می‌شوند؛ فقط اگر سرویس «صدای عصبی آنلاین» را انتخاب کنی، همان یک جمله‌ی کوتاه برای ساخت صدا به اینترنت می‌رود و هیچ داده‌ی مالی دیگری ارسال نمی‌شود.

**فهرست تغییرات:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

</div>

---

## 🇬🇧 Darino {{TAG}} — offline personal finance app

### New in 3.5.4

- 🎛️ **Dedicated Sherpa-ONNX Voice Tuning Panel** — full-featured modal sheet to customize the on-device neural voice:
  - **Fine-Grained Pitch & Tone Control**: Stepper and preset chips from 0.70x to 1.35x (deep, natural, high, and auto-by-gender) without altering speech speed
  - **PCM Volume Boost (Gain)**: Direct 100%, 125%, and 150% boost tailored for noisy in-car driving environments
  - **CPU Core Allocation**: 1 core (battery-friendly), 2 cores (balanced default), or 4 cores (fastest offline synthesis)
  - **Speaker ID Selection**: Choose specific speaker IDs in multi-speaker models
  - **Model Diagnostics & Clean Reset**: Live inspection of extracted model size and ready status, with a one-tap clean re-extraction tool
  - **In-Panel Instant Audio Test**: Dedicated live test button directly inside the sheet for immediate acoustic feedback

### Features from 3.5.3

- 🎙️ **Strict Voice Engine Testing & Zero Silent Fallback** — each speech engine (`local` offline Sherpa-ONNX neural, `neural` online Edge, `clips` offline voice clips, `system` device TTS) is tested directly with live parameters `(engine, gender, rate, template, chimeEnabled, amountToman)` without falling back to offline clips on errors, giving instant and accurate feedback (fallback is strictly reserved for real background SMS)
- 🔘 **Dedicated Test Button Next to Every Speech Engine** — each of the 4 engine options in Settings now includes its own immediate "تست صدا" test button with a loading indicator, allowing direct one-tap comparison of voices without changing the active setting
- 👩‍🦰👨‍🦱 **Distinct Male & Female Voices in Offline Neural TTS (Sherpa-ONNX)** — native Sherpa processing incorporates speaker selection and precise pitch shifting (0.88x male / 1.12x female) to deliver natural and distinct male and female voices even with single-speaker models
- ✍️ **Full Support for Arbitrary Custom Sentences** — users can write any sentence with or without template tokens; the native and TypeScript engines speak the text cleanly as written without reverting to default sentences
- ⚡ **Unified Test Action & Streamlined UI** — replaced duplicate test buttons with a single unified full-width test button at the bottom, improved real-time feedback, and added clear notices when offline clips mode is active

### Features from 3.5.2

- 🗣️ **Persian neural voice on the phone itself** — the sherpa-onnx engine and a Piper model are bundled inside the APK, so the whole sentence (payer name and any custom template) is synthesised offline in one breath. Large amounts and custom sentences no longer depend on stitched clips. The first announcement takes a few extra seconds while the model loads, and if the model cannot be prepared the chain still falls back to bundled clips and then the phone’s TTS — never to silence
- 🔢 **The +100,000 toman bug is fixed** — 105,000 → “صد و پنج”, 150,000 → “صد و پنجاه”, 250,000 → “دویست و پنجاه”, 500,000 → “پونصد”, 850,000 → “هشتصد و پنجاه” and 1,500,000 → “یک میلیون و پونصد هزار”
- ➗ **Exact currency-unit reading** — “۱٬۲۰۰٬۰۰۰ ریال” becomes 120,000 toman and “۲٬۵۰۰٬۰۰۰ ریال” becomes 250,000 toman. The unit next to a number wins, then the unit of the whole message, and the default is rial; both “تومان/تومن/Toman” and “ریال/Rial/IRR” are recognised
- 🧹 **Odd amount separators** — `٬`, `،`, `٫`, `'`, spaced three-digit groups and even slashes (`1/200/000`) are all read correctly instead of truncating the amount
- 🎧 **No robotic gap between clips** — offline clips are now chained with `MediaPlayer.setNextMediaPlayer`, so the next clip is prepared ahead of time and playback is gapless
- 📱 **Surviving Android 14 and 15** — `mediaPlayback` foreground-service type (with a `specialUse` fallback), the new Android 14 permissions, a short wake lock held from the inbox query until playback ends, and an `_id` watermark instead of timestamps; the service is no longer killed when the app is swiped away, and no deposit is lost while it was down
- ↔️ **Proper RTL in Settings and Bank accounts** — titles, hints, the preview box, chips and test buttons stay right-to-left even when the phone language is English
- 🧪 **Two voice-test buttons** — one below 100,000 (70,000) and one above it (150,000), so both speech paths can be checked right there

### Features from 3.5.1

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
If you see the “background permanence” banner, tap it so Xiaomi/Samsung does not kill the service;
in the voice section also tap “Autostart on Xiaomi/Android” and lock Darino in the recents screen.
SMS is parsed on the device; only if you pick the online neural voice does that one short sentence
reach the internet to synthesize audio, with no other financial data sent.

**What's changed:** https://github.com/hzabbas/DARINO/commits/{{TAG}}

---

**Developed by Abbas Hz** · [github.com/hzabbas/DARINO](https://github.com/hzabbas/DARINO)
