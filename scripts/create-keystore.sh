#!/usr/bin/env bash
# ساخت کلید امضای ثابت دارینو با مشخصات توسعه‌دهنده.
#
# !!! هشدار مهم !!!
# اگر از قبل نسخه‌ای از دارینو روی گوشی نصب است، این کلید را دوباره نساز؛
# امضای جدید با نسخه‌ی قدیمی تداخل می‌کند و آپدیت فقط با حذف برنامه ممکن می‌شود
# (و دیتابیس SQLite کاربر از بین می‌رود). این اسکریپت فقط برای راه‌اندازی از صفر
# یا چرخش آگاهانه‌ی کلید است.
#
# استفاده:
#   bash scripts/create-keystore.sh            # می‌سازد و رمز تصادفی چاپ می‌کند
#   bash scripts/create-keystore.sh --force    # کلید قبلی را بازنویسی می‌کند
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE="$ROOT/credentials/android/darino-release.keystore"
ALIAS="darino"
DNAMES="CN=Abbas Hz, OU=Software Engineering, O=Darino, C=IR"

if [ -f "$KEYSTORE" ] && [ "${1:-}" != "--force" ]; then
  echo "کلید از قبل وجود دارد: $KEYSTORE"
  echo "برای بازنویسی (خطر تداخل امضا) از --force استفاده کن."
  exit 1
fi

KEYTOOL="keytool"
if [ -x "/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe" ]; then
  KEYTOOL="/c/Program Files/Android/Android Studio/jbr/bin/keytool.exe"
fi

mkdir -p "$(dirname "$KEYSTORE")"
PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"

"$KEYTOOL" -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PASSWORD" -keypass "$PASSWORD" \
  -dname "$DNAMES"

cat > "$ROOT/credentials/android/keystore-info.txt" <<INFO
DARINO RELEASE KEYSTORE

file: credentials/android/darino-release.keystore
alias: $ALIAS
subject: $DNAMES
store password: $PASSWORD
key password: $PASSWORD

Keep this file and this password safe. Upload the same values as repo secrets:
ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD
INFO

echo
echo "کلید ساخته شد: $KEYSTORE"
echo "رمز در credentials/android/keystore-info.txt ذخیره شد."
echo "حالا سه secret را ست کن:"
echo "  gh secret set ANDROID_KEYSTORE_BASE64 --body \"\$(base64 -w0 $KEYSTORE)\""
echo "  gh secret set ANDROID_KEYSTORE_PASSWORD --body \"$PASSWORD\""
echo "  gh secret set ANDROID_KEY_ALIAS --body \"$ALIAS\""
echo "  gh secret set ANDROID_KEY_PASSWORD --body \"$PASSWORD\""
