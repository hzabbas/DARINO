<div align="center">

# دارینو · Darino

**مدیریت دخل‌وخرج شخصی، کاملاً آفلاین** · **Offline personal finance for Persian users**

[🇮🇷 فارسی](#persian) · [🇬🇧 English](#english)

</div>

---

<a id="persian"></a>

## 🇮🇷 فارسی

### دارینو چیست؟

دارینو یک اپلیکیشن اندروید برای ثبت و تحلیل درآمد و هزینه‌ی روزمره است که مخصوص کاربر فارسی‌زبان
ساخته شده: تقویم کامل شمسی، رابط راست‌به‌چپ، اعداد فارسی و دیتابیس آفلاین SQLite.
هیچ داده‌ای به اینترنت فرستاده نمی‌شود و برنامه بدون اتصال هم کامل کار می‌کند.

### ویژگی‌های کلیدی (نسخه ۳.۰)

- **خواندن خودکار پیامک بانک‌ها** — بلوبانک، پاسارگاد، مهر ایران و بیش از ۲۰ بانک دیگر؛
  رمزهای پویا همیشه نادیده گرفته می‌شوند، مبالغ ریالی خودکار به تومان تبدیل می‌شوند و
  مانده‌ی هر حساب از متن پیامک هم‌تراز می‌شود
- **تشخیص انتقال بین کارت‌های خودت** — اگر برداشت و واریز در ۱۰ دقیقه جفت شوند، به‌جای
  درآمد/هزینه‌ی کاذب به‌عنوان «انتقال» با کارمزد ثبت می‌شوند
- **صندوق تایید سریع** — قبل از ورود به داشبورد، هر پیامک با یک لمس به هزینه/درآمد/انتقال
  تبدیل یا نادیده گرفته می‌شود
- **حساب‌های بانکی با موجودی اولیه** — موجودی قبلی هر حساب را وارد کن و موجودی کل را در داشبورد ببین
- **تم روشن، تاریک و خودکار** — سه حالت با ذخیره‌ی انتخاب کاربر؛ تغییر لحظه‌ای و بدون ری‌استارت
- **ثبت سریع درآمد روزانه** — مثلاً «فعالیت در اسنپ» با مبلغ، تاریخ شمسی و یادداشت شیفت
- **ماشین‌حساب مبلغ** — ورودی `450000+120000` یا دکمه‌های +۵۰ هزار تا +۱ میلیون، بدون خطای صفر
- **الگوهای ثبت سریع** — چیپ‌های پرکاربردترین دسته‌ها برای ثبت یک‌لمسی
- **هدف درآمد و سقف بودجه‌ی ماهانه** — نوار پیشرفت با هشدار زرد در ۸۰٪ و قرمز در عبور از ۱۰۰٪
- **دسته‌بندی نامحدود** — هزینه‌های خودرو (بنزین، استهلاک، تعمیرات، تعویض روغن، لاستیک، کارواش)،
  قبوض، خوراک و هزینه‌های شخصی؛ هر دسته با آیکون و رنگ دلخواه و امکان ویرایش یا حذف ایمن
- **داشبورد بازه‌ای** — امروز، این هفته (شنبه تا جمعه)، این ماه شمسی و کل زمان‌ها، با فیلتر
  «همه/درآمد/هزینه» و مرتب‌سازی بر اساس جدیدترین یا مبلغ
- **گزارش و تحلیل** — نمودار میله‌ای درآمد/هزینه برای ۷ روز یا ۶ ماه، سهم درصدی هر دسته،
  خلاصه‌ی آماری هوشمند (میانگین روزانه، پرهزینه‌ترین دسته، بزرگ‌ترین تراکنش) و اشتراک‌گذاری
  گزارش متنی آماده برای تلگرام و واتساپ
- **خروجی اکسل (CSV)** — با BOM یونیکد تا فارسی در Excel درست باز شود
- **تقویم شمسی دقیق** — طول ماه‌ها و کبیسه‌ی اسفند بر اساس `jalaali-js`، بدون خطای منطقه‌ی زمانی
- **پشتیبان‌گیری و بازیابی** — خروجی JSON از همه‌ی دسته‌بندی‌ها و تراکنش‌ها و بازگردانی کامل
- **آفلاین و خصوصی** — دیتابیس SQLite روی خود گوشی؛ بدون حساب کاربری و بدون سرور

### نصب از Releases

1. به بخش [Releases](https://github.com/hzabbas/DARINO/releases) برو و آخرین نسخه را باز کن.
2. یکی از فایل‌ها را دانلود کن:
   - `Darino-vX.Y.Z-arm64-v8a.apk` — برای گوشی‌های امروزی (پیشنهاد اول، سبک‌ترین)
   - `Darino-vX.Y.Z-armeabi-v7a.apk` — برای گوشی‌های قدیمی‌تر ۳۲ بیتی
   - `Darino-vX.Y.Z-universal.apk` — اگر دو فایل بالا نصب نشد
3. فایل را روی گوشی باز کن و اگر اندروید اجازه‌ی «نصب از منبع ناشناس» خواست، برای همان برنامه فعالش کن.

همه‌ی نسخه‌ها با یک کلید امضای ثابت ساخته می‌شوند، بنابراین نسخه‌ی جدید مستقیم روی نسخه‌ی قبلی
نصب می‌شود و اطلاعات مالی پاک نمی‌شود.

### اجرای پروژه

```bash
npm install
npm start          # اجرا در Expo Go
npm run android    # اجرا روی گوشی یا شبیه‌ساز
npm run web        # نسخه‌ی وب با ذخیره‌سازی localStorage
npm test           # تست‌های منطق مالی، تاریخ و دیتابیس
npm run typecheck
```

### ساخت نسخه‌ی جدید

```bash
npm run release            # 1.0.1 → کامیت، تگ، push و بیلد خودکار APK در GitHub Actions
npm run release -- minor   # 1.1.0
npm run release -- major   # 2.0.0
```

### ساختار پروژه

```
src/app          صفحات (expo-router): داشبورد، ثبت تراکنش، دسته‌بندی‌ها، گزارش، تنظیمات
src/components   کامپوننت‌های مشترک (کارت‌ها، فرم‌ها، انتخاب تاریخ شمسی، …)
src/db           اسکیمای SQLite، داده‌های اولیه و پرس‌وجوها
src/utils        اعداد فارسی، پول، تاریخ شمسی، بازه‌ها، پشتیبان‌گیری
plugins          پلاگین‌های prebuild: امضای ثابت، بهینه‌سازی APK، راست‌به‌چپ بومی
tests            تست‌های node:test برای منطق حساس
```

### توسعه‌دهنده

**Developed by Abbas Hz** — [github.com/hzabbas/DARINO](https://github.com/hzabbas/DARINO)

---

<a id="english"></a>

## 🇬🇧 English

### What is Darino?

Darino is an Android app for tracking everyday income and expenses, built for Persian-speaking users:
a full Jalali (Solar Hijri) calendar, right-to-left interface, Persian digits and a local SQLite
database. Nothing leaves the phone — the app works completely offline.

### Key features (3.0)

- **Automatic Iranian bank SMS reading** — Blu, Pasargad, Mehr Iran and 20+ banks; OTP messages are
  always ignored, rial amounts convert to toman automatically, and each account balance is synced
  from the message
- **Self-transfer detection** — an outgoing and incoming message within 10 minutes are linked as a
  transfer with its fee instead of fake income/expense
- **Quick review gate** — before the dashboard, every detected message becomes income, expense or
  transfer in one tap, or gets ignored
- **Bank accounts with opening balance** — enter what you already had; the total shows on the dashboard
- **Light, dark and system theme** — three modes, saved per user, switching instantly with no restart
- **Quick daily income logging** — e.g. a Snap (ride-hailing) shift with amount, Jalali date and notes
- **Amount calculator** — type `450000+120000` or tap +50k/+100k/+500k/+1M chips instead of counting zeros
- **Quick presets** — one-tap chips built from your most used categories
- **Monthly income goal and expense budget** — progress bars with an amber warning at 80% and red past 100%
- **Unlimited categories** — car costs (fuel, depreciation, repairs, oil change, tyres, car wash),
  bills, food and personal spending; each with its own icon and colour, editable or safely deletable
- **Range dashboard** — today, this week (Saturday to Friday), this Jalali month and all time, with
  an all/income/expense filter and sorting by date or amount
- **Reports** — income vs expense bar chart for the last 7 days or 6 months, category shares, a smart
  stats card (daily averages, top category, biggest transaction) and a shareable Persian text report
- **Excel export (CSV)** — UTF-8 BOM included so Persian opens correctly in Excel
- **Accurate Jalali calendar** — month lengths and the Esfand leap day handled by `jalaali-js`,
  with no timezone off-by-one bugs
- **Backup and restore** — export every category and transaction to JSON and restore it in one step
- **Offline and private** — SQLite on the device; no account, no server

### Install from Releases

1. Open the [Releases](https://github.com/hzabbas/DARINO/releases) page and pick the latest version.
2. Download one of:
   - `Darino-vX.Y.Z-arm64-v8a.apk` — current phones (recommended, smallest)
   - `Darino-vX.Y.Z-armeabi-v7a.apk` — older 32-bit phones
   - `Darino-vX.Y.Z-universal.apk` — fallback if neither installs
3. Open the file on the phone and allow "install from unknown sources" for your file manager if asked.

Every release is signed with the same keystore, so a new version installs straight over the previous
one and your financial data stays intact.

### Run locally

```bash
npm install
npm start          # run in Expo Go
npm run android    # run on a device or emulator
npm run web        # web build backed by localStorage
npm test           # money, date and database logic tests
npm run typecheck
```

### Cut a release

```bash
npm run release            # 1.0.1 → commit, tag, push and build the APK on GitHub Actions
npm run release -- minor   # 1.1.0
npm run release -- major   # 2.0.0
```

### Project layout

```
src/app          screens (expo-router): dashboard, transaction form, categories, reports, settings
src/components   shared UI (cards, forms, Jalali date picker, …)
src/db           SQLite schema, seed data and queries
src/utils        Persian digits, money, Jalali dates, ranges, backup
plugins          prebuild plugins: fixed signing, APK size, native RTL
assets/brand     brand logo used by scripts/generate-icons.js
scripts          release script, keystore generator, icon generator (from assets/brand/logo.png)
plugins/android  native SMS reader (Kotlin module + receiver), copied in at prebuild
tests            node:test suites for the sensitive logic
```

### Developer

**Developed by Abbas Hz** — [github.com/hzabbas/DARINO](https://github.com/hzabbas/DARINO)

---

<div align="center">
<sub>© 2026 Abbas Hz · Darino</sub>
</div>
