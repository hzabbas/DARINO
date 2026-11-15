package com.darino.app.sms

import android.content.Context

// Only dependencies outside this test's voice/audio scope are doubled.
object SmsStore {
  const val EXTRA_OPEN_PENDING = "open_pending"
  const val EXTRA_SMS_FINGERPRINT = "fingerprint"
  fun setSenders(context: Context, senders: List<String>) {}
  fun read(context: Context): String = "{\"items\":[],\"maxSeq\":0}"
  fun clearUpTo(context: Context, maxSeq: Long) {}
}
object VoiceAnnouncerService {
  fun start(context: Context): Boolean = true
  fun stop(context: Context) {}
}
object VoiceGuardScheduler {
  fun scheduleRelaunch(context: Context, delay: Long) {}
  fun ensure(context: Context) {}
  fun isAlive(context: Context): Boolean = true
  fun lastSeen(context: Context): Long = 0L
}

fun checkJson(value: String): String = VoiceConfigStore.read(Context()).template

fun main() {
  fun expect(value: Boolean, message: String) {
    if (!value) throw AssertionError(message)
  }

  expect(
    VoiceService.normalize("edge") == VoiceService.NEURAL &&
      VoiceService.normalize("offline") == VoiceService.CLIPS &&
      VoiceService.normalize("local") == VoiceService.LOCAL &&
      VoiceService.normalize("clips") == VoiceService.CLIPS,
    "legacy engine migration"
  )

  val custom = "واریز جدید! حتماً تایید شود..."
  val direct = SpeechTemplate.render(custom, null, 70_000L, null, null)
  expect(direct == custom, "free text was changed: $direct")
  expect(SpeechTemplate.sanitize("سلام") == "سلام", "text without amount was reset")
  expect(SpeechTemplate.sanitize("") == SpeechTemplate.DEFAULT, "blank text should use default")
  expect(
    SpeechTemplate.render("{نام}، {مبلغ} تومن برات واریز کرد", "علی محمدی", 70_000L, "بلوبانک", null) ==
      "علی محمدی، هفتاد تومن برات واریز کرد",
    "template parity with TypeScript"
  )
  expect(
    SpeechTemplate.render("{name} {amountNumber} تومن", "سارا", 1_200_000L, null, null) ==
      "سارا ۱,۲۰۰,۰۰۰ تومن",
    "legacy numeric token parity"
  )

  val context = Context()
  val saved = VoiceConfigStore.save(
    context,
    "{\"enabled\":true,\"senders\":[\"blu\"],\"accounts\":[]}"
  )
  expect(saved, "initial config save")
  val updated = VoiceConfigStore.saveVoiceSelection(
    context, "local", "male", 0.9, custom, false
  )
  val config = VoiceConfigStore.read(context)
  expect(updated && config.enabled, "synchronous settings write")
  expect(config.service == "local" && config.gender == "male", "test engine/gender persisted")
  expect(config.chime == false && config.rate == 0.9f, "chime/rate persisted")
  expect(config.template == custom, "live template persisted")
  expect(config.senders == listOf("blu"), "account senders must not be discarded by tests")

  val token = EdgeToken.generate(1_700_000_000_000L)
  expect(Regex("[0-9A-F]{16}-[0-9A-F]{64}").matches(token), "edge token shape")
  expect(token == EdgeToken.generate(1_700_000_000_000L), "edge token is not deterministic in a GEC window")

  expect(
    VoiceClipStitcher.clipsFor(125_500L)?.joinToString(",") ==
      "100_o,20_o,5,hezar_o,500,toman_variz_shod",
    "clip stitching"
  )

  val method = SmsReaderModule::class.java.getDeclaredMethod(
    "testVoiceAnnouncement",
    String::class.java, String::class.java, Double::class.javaPrimitiveType,
    String::class.java, Boolean::class.javaPrimitiveType, Double::class.javaPrimitiveType,
    com.facebook.react.bridge.Promise::class.java
  )
  expect(method.name == "testVoiceAnnouncement", "direct six-parameter native test bridge")
  println("VOICE_KOTLIN_OK: strict engines, templates, config, token and bridge")
}
