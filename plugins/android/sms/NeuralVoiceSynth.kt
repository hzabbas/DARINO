package com.darino.app.sms

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.URLEncoder
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
 * گوینده‌ی طبیعی فارسی.
 *
 * مرحله‌ی یک: صداهای عصبی Microsoft Edge (`fa-IR-DilaraNeural` و
 * `fa-IR-FaridNeural`) از طریق WebSocket. مرحله‌ی دو: Google Translate TTS.
 * فایل MP3 در `cacheDir` ذخیره می‌شود تا اعلام‌های بعدی بدون اینترنت و بی‌درنگ
 * پخش شوند. اگر هر دو شکست بخورند `null` برمی‌گردد و لایه‌ی بالاتر به TTS خود
 * اندروید پناه می‌برد.
 *
 * هیچ‌کدام از این دو سرویس داده‌ی حساسی نمی‌فرستند؛ فقط همان جمله‌ی کوتاه واریز.
 */
object NeuralVoiceSynth {
  private const val EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
  private const val EDGE_VOICE_FEMALE = "fa-IR-DilaraNeural"
  private const val EDGE_VOICE_MALE = "fa-IR-FaridNeural"
  private const val GOOGLE_TTS_URL =
    "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fa&q="

  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(3, TimeUnit.SECONDS)
      .readTimeout(4, TimeUnit.SECONDS)
      .writeTimeout(3, TimeUnit.SECONDS)
      .build()
  }

  /** فایل MP3 آماده‌ی پخش؛ یا `null` اگر هیچ منبعی در دسترس نبود. */
  fun synthesize(context: Context, text: String, gender: String): File? {
    if (text.isBlank()) return null

    val cached = cacheFile(context, text, gender)
    if (cached.exists() && cached.length() > 512L) return cached

    val edge = tryEdgeSynthesis(text, gender, cached)
    if (edge != null) return edge

    val google = tryGoogleSynthesis(text, cached)
    if (google != null) return google

    try {
      cached.delete()
    } catch (t: Throwable) {
      // نادیده
    }
    return null
  }

  private fun cacheFile(context: Context, text: String, gender: String): File {
    val directory = File(context.cacheDir, "voice-announcer")
    try {
      if (!directory.exists()) directory.mkdirs()
    } catch (t: Throwable) {
      // اگر ساخت پوشه نشد، پخش آنلاین همچنان تلاش می‌شود
    }
    return File(directory, hash("$gender|$text") + ".mp3")
  }

  private fun hash(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02X".format(it) }
  }

  // -------------------------------------------------------------------------
  // Edge Neural TTS (WebSocket)
  // -------------------------------------------------------------------------

  private fun tryEdgeSynthesis(text: String, gender: String, target: File): File? {
    return try {
      val voice = if (gender == "male") EDGE_VOICE_MALE else EDGE_VOICE_FEMALE
      val url = buildString {
        append("wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1")
        append("?TrustedClientToken=").append(EDGE_TOKEN)
        append("&Sec-MS-GEC=").append(gecToken())
        append("&Sec-MS-GEC-Version=1-130.0.2849.68")
      }

      val request = Request.Builder()
        .url(url)
        .header("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
        .header(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
        )
        .header("Pragma", "no-cache")
        .header("Cache-Control", "no-cache")
        .build()

      val audio = ByteArrayOutputStream()
      val latch = CountDownLatch(1)
      val failed = AtomicBoolean(false)
      val socketHolder = arrayOfNulls<WebSocket>(1)

      val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
          try {
            val config =
              "X-Timestamp:${timestamp()}\r\n" +
                "Content-Type:application/json; charset=utf-8\r\n" +
                "Path:speech.config\r\n\r\n" +
                "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":" +
                "{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}," +
                "\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}"
            webSocket.send(config)

            val ssml =
              "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fa-IR'>" +
                "<voice name='$voice'><prosody rate='+2%'>${escapeXml(text)}</prosody></voice></speak>"
            val message =
              "X-RequestId:${UUID.randomUUID().toString().replace("-", "")}\r\n" +
                "Content-Type:application/ssml+xml\r\n" +
                "X-Timestamp:${timestamp()}Z\r\n" +
                "Path:ssml\r\n\r\n" + ssml
            webSocket.send(message)
          } catch (t: Throwable) {
            failed.set(true)
            latch.countDown()
          }
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
          try {
            val data = bytes.toByteArray()
            if (data.size < 2) return

            // قاب دودویی Edge: دو بایت طول هدر، سپس هدر متنی، سپس بایت‌های صدا.
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
          if (text.contains("Path:turn.end")) latch.countDown()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
          failed.set(true)
          latch.countDown()
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
          latch.countDown()
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
          latch.countDown()
        }
      }

      socketHolder[0] = client.newWebSocket(request, listener)
      latch.await(4, TimeUnit.SECONDS)

      try {
        socketHolder[0]?.cancel()
      } catch (t: Throwable) {
        // نادیده
      }

      val bytes = audio.toByteArray()
      if (failed.get() && bytes.size <= 512) return null
      if (bytes.size <= 512) return null

      writeAudio(target, bytes)
    } catch (t: Throwable) {
      null
    }
  }

  // -------------------------------------------------------------------------
  // Google Translate TTS (HTTP، بدون کلید)
  // -------------------------------------------------------------------------

  private fun tryGoogleSynthesis(text: String, target: File): File? {
    return try {
      val url = GOOGLE_TTS_URL + URLEncoder.encode(text, "UTF-8")
      val request = Request.Builder()
        .url(url)
        .header("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36")
        .build()

      client.newCall(request).execute().use { response ->
        if (!response.isSuccessful) return null
        val body = response.body ?: return null
        val bytes = body.bytes()
        if (bytes.size <= 512) return null
        writeAudio(target, bytes)
      }
    } catch (t: Throwable) {
      null
    }
  }

  private fun writeAudio(target: File, bytes: ByteArray): File? {
    return try {
      FileOutputStream(target).use { output -> output.write(bytes) }
      if (target.exists() && target.length() > 512L) target else null
    } catch (t: Throwable) {
      null
    }
  }

  // -------------------------------------------------------------------------
  // امضای Edge TTS (همان الگوریتم edge-tts)
  // -------------------------------------------------------------------------

  private fun gecToken(): String {
    // Windows file time با گام ۵ دقیقه‌ای؛ سرور مایکروسافت همین را می‌خواهد.
    val ticks = (System.currentTimeMillis() / 1000L + 11_644_473_600L) * 10_000_000L
    val rounded = ticks - (ticks % 3_000_000_000L)
    val digest = MessageDigest.getInstance("SHA-256")
      .digest("$rounded$EDGE_TOKEN".toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02X".format(it) }
  }

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
