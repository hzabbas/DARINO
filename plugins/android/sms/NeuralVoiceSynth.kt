package com.darino.app.sms

import android.content.Context
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * گوینده‌ی طبیعی فارسی با صداهای عصبی Microsoft Edge.
 *
 * Edge ReadAloud فقط با WebSocket کار می‌کند؛ درخواست HTTP ساده همیشه ۴۰۳
 * می‌گیرد چون URL باید توکن زمانی [EdgeToken] و هدرهای مرورگر را داشته باشد.
 * صداهای فارسی موجود `fa-IR-DilaraNeural` (زن) و `fa-IR-FaridNeural` (مرد)
 * هستند. خروجی MP3 در `cacheDir` ذخیره می‌شود تا تکرار همان جمله بدون
 * اینترنت و بی‌درنگ پخش شود.
 *
 * این کلاس هرگز استثنا پرتاب نمی‌کند: اگر شبکه نبود یا سرور جواب نداد `null`
 * برمی‌گردد و لایه‌ی بالاتر از کلیپ‌های آفلاین یا TTS استفاده می‌کند.
 *
 * فقط همان جمله‌ی کوتاه واریز به مایکروسافت می‌رود؛ هیچ داده‌ی دیگری نمی‌رود.
 */
object NeuralVoiceSynth {
  private const val TAG = "DarinoVoice"
  private const val EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
  private const val EDGE_GEC_VERSION = "2-143.0.3650.75"
  private const val EDGE_VOICE_FEMALE = "fa-IR-DilaraNeural"
  private const val EDGE_VOICE_MALE = "fa-IR-FaridNeural"
  private const val EDGE_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"
  private const val EDGE_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
  private const val OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"

  /** سقف انتظار برای کل گفت‌وگوی WebSocket؛ بیشتر از این، کاربر منتظر نمی‌ماند. */
  private const val SYNTH_TIMEOUT_MS = 4_000L
  private const val MIN_AUDIO_BYTES = 500

  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(3, TimeUnit.SECONDS)
      .readTimeout(8, TimeUnit.SECONDS)
      .writeTimeout(4, TimeUnit.SECONDS)
      .retryOnConnectionFailure(false)
      .build()
  }

  /** فایل MP3 آماده‌ی پخش؛ یا `null` اگر ساخت صدا ممکن نشد. */
  fun synthesize(context: Context, text: String, gender: String): File? {
    val sentence = text.trim()
    if (sentence.isEmpty()) return null

    val target = cacheFile(context, sentence, gender)
    if (target.exists() && target.length() > MIN_AUDIO_BYTES) return target

    val audio = try {
      requestAudio(sentence, voiceFor(gender))
    } catch (t: Throwable) {
      null
    }

    if (audio == null || audio.size <= MIN_AUDIO_BYTES) return null
    return writeAudio(target, audio)
  }

  private fun voiceFor(gender: String): String {
    return if (gender == "male") EDGE_VOICE_MALE else EDGE_VOICE_FEMALE
  }

  private fun cacheFile(context: Context, text: String, gender: String): File {
    val directory = File(context.cacheDir, "voice-announcer")
    try {
      if (!directory.exists()) directory.mkdirs()
    } catch (t: Throwable) {
      // پوشه‌ی کش همیشه در دسترس است؛ اگر نبود فایل کنار بقیه ساخته می‌شود
    }
    return File(directory, hash("$gender|$text") + ".mp3")
  }

  private fun hash(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    val builder = StringBuilder(digest.size * 2)
    for (byte in digest) {
      val number = byte.toInt() and 0xFF
      builder.append("0123456789ABCDEF"[number ushr 4])
      builder.append("0123456789ABCDEF"[number and 0x0F])
    }
    return builder.toString()
  }

  // -------------------------------------------------------------------------
  // WebSocket مایکروسافت
  // -------------------------------------------------------------------------

  private fun requestAudio(text: String, voice: String): ByteArray? {
    val connectionId = UUID.randomUUID().toString().replace("-", "")
    val requestId = UUID.randomUUID().toString().replace("-", "")
    val url = buildString {
      append("wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1")
      append("?TrustedClientToken=").append(EDGE_TOKEN)
      append("&ConnectionId=").append(connectionId)
      append("&Sec-MS-GEC=").append(EdgeToken.generate())
      append("&Sec-MS-GEC-Version=").append(EDGE_GEC_VERSION)
    }

    val request = Request.Builder()
      .url(url)
      .header("Pragma", "no-cache")
      .header("Cache-Control", "no-cache")
      .header("Origin", EDGE_ORIGIN)
      .header("User-Agent", EDGE_USER_AGENT)
      // مرورگر Edge همیشه یک شناسه‌ی muid می‌فرستد؛ سرور بدون آن ۴۰۳ می‌دهد.
      .header("Cookie", "muid=${randomMuid()};")
      .build()

    val audio = ByteArrayOutputStream()
    val done = CountDownLatch(1)
    val failed = AtomicBoolean(false)
    val socketHolder = arrayOfNulls<WebSocket>(1)

    val listener = object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        try {
          webSocket.send(speechConfigFrame())
          webSocket.send(ssmlFrame(requestId, voice, text))
        } catch (t: Throwable) {
          failed.set(true)
          done.countDown()
        }
      }

      override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
        try {
          val data = bytes.toByteArray()
          if (data.size < 2) return

          // قاب دودویی Edge: دو بایت طول هدر (big-endian)، سپس هدر متنی، سپس صدا.
          val headerLength = ((data[0].toInt() and 0xFF) shl 8) or (data[1].toInt() and 0xFF)
          if (data.size < 2 + headerLength) return
          val header = String(data, 2, headerLength, Charsets.UTF_8)
          if (header.contains("Path:audio")) {
            audio.write(data, 2 + headerLength, data.size - 2 - headerLength)
          }
        } catch (t: Throwable) {
          // یک قاب خراب نباید کل صدا را دور بریزد
        }
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        if (text.contains("Path:turn.end")) {
          try {
            webSocket.close(1000, null)
          } catch (t: Throwable) {
            // نادیده
          }
          done.countDown()
        }
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        Log.w(TAG, "edge tts failed: ${t.message} (${response?.code})")
        failed.set(true)
        done.countDown()
      }

      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        done.countDown()
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        done.countDown()
      }
    }

    socketHolder[0] = client.newWebSocket(request, listener)
    val finished = done.await(SYNTH_TIMEOUT_MS, TimeUnit.MILLISECONDS)

    if (!finished) {
      failed.set(true)
      try {
        socketHolder[0]?.cancel()
      } catch (t: Throwable) {
        // نادیده
      }
    }

    val bytes = audio.toByteArray()
    if (bytes.size <= MIN_AUDIO_BYTES) {
      if (!failed.get()) Log.w(TAG, "edge tts returned no audio")
      return null
    }
    return bytes
  }

  private fun speechConfigFrame(): String {
    return "X-Timestamp:${timestamp()}\r\n" +
      "Content-Type:application/json; charset=utf-8\r\n" +
      "Path:speech.config\r\n\r\n" +
      "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":" +
      "{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}," +
      "\"outputFormat\":\"$OUTPUT_FORMAT\"}}}}"
  }

  private fun ssmlFrame(requestId: String, voice: String, text: String): String {
    val ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fa-IR'>" +
      "<voice name='$voice'>" +
      "<prosody pitch='+0Hz' rate='+5%' volume='+0%'>${escapeXml(text)}</prosody>" +
      "</voice></speak>"

    return "X-RequestId:$requestId\r\n" +
      "Content-Type:application/ssml+xml\r\n" +
      "X-Timestamp:${timestamp()}Z\r\n" +
      "Path:ssml\r\n\r\n" +
      ssml
  }

  private fun randomMuid(): String {
    val bytes = ByteArray(16)
    java.security.SecureRandom().nextBytes(bytes)
    val builder = StringBuilder(32)
    for (byte in bytes) {
      val number = byte.toInt() and 0xFF
      builder.append("0123456789ABCDEF"[number ushr 4])
      builder.append("0123456789ABCDEF"[number and 0x0F])
    }
    return builder.toString()
  }

  private fun writeAudio(target: File, bytes: ByteArray): File? {
    return try {
      FileOutputStream(target).use { output -> output.write(bytes) }
      if (target.exists() && target.length() > MIN_AUDIO_BYTES) target else null
    } catch (t: Throwable) {
      null
    }
  }

  /** همان قالب JavaScript که Edge می‌فرستد؛ `time.gmtime` پایتون معادلش است. */
  private fun timestamp(): String {
    val formatter = SimpleDateFormat(
      "EEE MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'",
      Locale.US
    )
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }

  private fun escapeXml(value: String): String {
    return value
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
      .replace("'", "&apos;")
  }
}
