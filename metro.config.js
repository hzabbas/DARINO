const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite برای نسخه‌ی وب یک فایل wa-sqlite.wasm دارد؛ Metro باید آن را به‌عنوان asset بشناسد.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// SharedArrayBuffer (که wa-sqlite در وب استفاده می‌کند) فقط با این هدرها فعال می‌شود.
// در حالت توسعه، همین هدرها از طرف سرور Metro ارسال می‌شوند.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
