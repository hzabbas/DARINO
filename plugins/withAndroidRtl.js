const { withMainApplication } = require('@expo/config-plugins');

/**
 * Enforce RTL layout on first app launch at native application startup.
 */
const IMPORT_ANCHOR = 'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint';
const IMPORT_LINE = 'import com.facebook.react.modules.i18nmanager.I18nUtil';

const ON_CREATE_ANCHOR = '  override fun onCreate() {\n    super.onCreate()';
const RTL_CALL = `
    // darino: force RTL before React Native initialization
    I18nUtil.getInstance().forceRTL(this, true)`;

module.exports = function withAndroidRtl(config) {
  return withMainApplication(config, (configWithApp) => {
    if (configWithApp.modResults.language !== 'kt') {
      throw new Error('withAndroidRtl only works with MainApplication.kt');
    }

    let contents = configWithApp.modResults.contents;
    if (contents.includes('I18nUtil')) {
      return configWithApp;
    }

    if (!contents.includes(IMPORT_ANCHOR)) {
      throw new Error(`withAndroidRtl: import anchor '${IMPORT_ANCHOR}' not found in MainApplication`);
    }
    if (!contents.includes(ON_CREATE_ANCHOR)) {
      throw new Error('withAndroidRtl: onCreate method not found in MainApplication');
    }

    contents = contents
      .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}\n${IMPORT_LINE}`)
      .replace(ON_CREATE_ANCHOR, `${ON_CREATE_ANCHOR}${RTL_CALL}`);

    configWithApp.modResults.contents = contents;
    return configWithApp;
  });
};
