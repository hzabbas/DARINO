const { withMainApplication } = require('@expo/config-plugins');

/**
 * راست‌به‌چپ از همان اولین اجرا.
 *
 * `I18nManager.forceRTL` در جاوااسکریپت فقط برای اجرای بعدی ذخیره می‌شود؛ برای همین
 * در نصب اول، چیدمان یک بار چپ‌به‌راست بالا می‌آمد و کاربر باید اپ را می‌بست و باز می‌کرد.
 * این پلاگین پرچم RTL را قبل از بالا آمدن React Native در MainApplication ست می‌کند،
 * پس اولین فریم هم راست‌به‌چپ است (مستقل از زبان سیستم).
 */
const IMPORT_ANCHOR = 'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint';
const IMPORT_LINE = 'import com.facebook.react.modules.i18nmanager.I18nUtil';

const ON_CREATE_ANCHOR = '  override fun onCreate() {\n    super.onCreate()';
const RTL_CALL = `
    // darino: راست‌به‌چپ پیش از راه‌اندازی React Native
    I18nUtil.getInstance().forceRTL(this, true)`;

module.exports = function withAndroidRtl(config) {
  return withMainApplication(config, (configWithApp) => {
    if (configWithApp.modResults.language !== 'kt') {
      throw new Error('withAndroidRtl فقط با MainApplication.kt کار می‌کند');
    }

    let contents = configWithApp.modResults.contents;
    if (contents.includes('I18nUtil')) {
      return configWithApp;
    }

    if (!contents.includes(IMPORT_ANCHOR)) {
      throw new Error(`withAndroidRtl: خط ایمپورت «${IMPORT_ANCHOR}» در MainApplication پیدا نشد`);
    }
    if (!contents.includes(ON_CREATE_ANCHOR)) {
      throw new Error('withAndroidRtl: متد onCreate در MainApplication پیدا نشد');
    }

    contents = contents
      .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`)
      .replace(ON_CREATE_ANCHOR, `${ON_CREATE_ANCHOR}${RTL_CALL}`);

    configWithApp.modResults.contents = contents;
    return configWithApp;
  });
};
