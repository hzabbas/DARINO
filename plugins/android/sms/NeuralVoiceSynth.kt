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
import kotlin.math.abs

/** Result container for online neural speech synthesis. */
data class NeuralVoiceResult(
  val audio: File? = null,
  val message: String? = null
)

/**
 * High-quality Persian speech synthesis using Microsoft Edge ReadAloud WebSocket API.
 * Uses DilaraNeural (female) and FaridNeural (male).
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

  /**
   * Synthesizes text to speech with given speed, pitch and volume.
   */
  fun synthesize(
    context: Context,
    text: String,
    gender: String,
    rate: Float,
    pitch: Float = 0.0f,
    gain: Float = 1.0f
  ): NeuralVoiceResult {
    val sentence = text.trim()
    if (sentence.isEmpty()) return NeuralVoiceResult(message = "جمله‌ای برای ساخت صدا وجود ندارد.")

    val speed = VoiceRate.normalize(rate)
    val normPitch = if (pitch in 0.5f..2.0f && abs(pitch - 1.0f) > 0.01f) pitch else 1.0f
    val normGain = gain.coerceIn(0.5f, 2.0f)

    val target = cacheFile(context, sentence, gender, speed, normPitch, normGain)
    if (target.exists() && target.length() > MIN_AUDIO_BYTES) return NeuralVoiceResult(audio = target)

    val audio = try {
      requestAudio(sentence, voiceFor(gender), speed, normPitch, normGain)
    } catch (t: Throwable) {
      Log.w(TAG, "edge request failed: ${t.javaClass.simpleName}: ${t.message}")
      null
    }

    if (audio == null || audio.size <= MIN_AUDIO_BYTES) {
      return NeuralVoiceResult(message = "اتصال به سرویس صوتی آنلاین برقرار نشد")
    }
    val file = writeAudio(target, audio)
    return if (file != null) {
      NeuralVoiceResult(audio = file)
    } else {
      NeuralVoiceResult(message = "ذخیره‌ی صدای دریافتی از سرویس آنلاین ممکن نشد.")
    }
  }

  private fun voiceFor(gender: String): String {
    return if (gender == "male") EDGE_VOICE_MALE else EDGE_VOICE_FEMALE
  }

  /** Cache key includes voice properties to avoid cache collisions. */
  private fun cacheFile(
    context: Context,
    text: String,
    gender: String,
    rate: Float,
    pitch: Float,
    gain: Float
  ): File {
    val directory = File(context.cacheDir, "voice-announcer")
    try {
      if (!directory.exists()) directory.mkdirs()
    } catch (t: Throwable) {
      // Fallback to cacheDir root if subdirectory creation fails
    }
    return File(directory, hash("$gender|$rate|$pitch|$gain|$text") + ".mp3")
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
  // Microsoft Edge ReadAloud WebSocket
  // -------------------------------------------------------------------------

  private fun requestAudio(
    text: String,
    voice: String,
    rate: Float,
    pitch: Float,
    gain: Float
  ): ByteArray? {
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
          webSocket.send(ssmlFrame(requestId, voice, text, rate, pitch, gain))
        } catch (t: Throwable) {
          failed.set(true)
          done.countDown()
        }
      }

      override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
        try {
          val data = bytes.toByteArray()
          if (data.size < 2) return

          // Binary frame: 2 bytes header length (big-endian), headers string, audio payload.
          val headerLength = ((data[0].toInt() and 0xFF) shl 8) or (data[1].toInt() and 0xFF)
          if (data.size < 2 + headerLength) return
          val header = String(data, 2, headerLength, Charsets.UTF_8)
          if (header.contains("Path:audio")) {
            audio.write(data, 2 + headerLength, data.size - 2 - headerLength)
          }
        } catch (t: Throwable) {
          // Keep writing other chunks even if one fails
        }
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        if (text.contains("Path:turn.end")) {
          try {
            webSocket.close(1000, null)
          } catch (t: Throwable) {
            // Ignore
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
        // Ignore
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

  /** Generates SSML payload with prosody rate, pitch and volume attributes. */
  private fun ssmlFrame(
    requestId: String,
    voice: String,
    text: String,
    rate: Float,
    pitch: Float,
    gain: Float
  ): String {
    val ratePercent = Math.round((rate - 1f) * 100f)
    val rateValue = if (ratePercent >= 0) "+$ratePercent%" else "$ratePercent%"

    val pitchPercent = if (abs(pitch - 1f) > 0.01f) Math.round((pitch - 1f) * 100f) else 0
    val pitchValue = if (pitchPercent >= 0) "+$pitchPercent%" else "$pitchPercent%"

    val gainPercent = if (abs(gain - 1f) > 0.01f) {
      Math.round((gain - 1f) * 100f).coerceIn(-50, 100)
    } else {
      0
    }
    val gainValue = if (gainPercent >= 0) "+$gainPercent%" else "$gainPercent%"

    val ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fa-IR'>" +
      "<voice name='$voice'>" +
      "<prosody pitch='$pitchValue' rate='$rateValue' volume='$gainValue'>${escapeXml(text)}</prosody>" +
      "</voice></speak>"

    return "X-RequestId:$requestId\r\n" +
      "Content-Type:application/ssml+xml\r\n" +
      "X-Timestamp:${timestamp()}\r\n" +
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
