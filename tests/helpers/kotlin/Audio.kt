package android.media

import java.io.FileDescriptor

class AudioAttributes {
  class Builder {
    fun setUsage(value: Int) = this
    fun setContentType(value: Int) = this
    fun build() = AudioAttributes()
  }
  companion object { const val USAGE_MEDIA = 1; const val CONTENT_TYPE_SPEECH = 2 }
}
class AudioFocusRequest {
  class Builder(type: Int) {
    fun setAudioAttributes(attributes: AudioAttributes) = this
    fun setWillPauseWhenDucked(value: Boolean) = this
    fun build() = AudioFocusRequest()
  }
}
class AudioManager {
  fun interface OnAudioFocusChangeListener { fun onAudioFocusChange(change: Int) }
  fun requestAudioFocus(request: AudioFocusRequest): Int = AUDIOFOCUS_REQUEST_GRANTED
  fun requestAudioFocus(listener: OnAudioFocusChangeListener, stream: Int, gain: Int): Int = AUDIOFOCUS_REQUEST_GRANTED
  fun abandonAudioFocusRequest(request: AudioFocusRequest): Int = 1
  fun abandonAudioFocus(listener: OnAudioFocusChangeListener): Int = 1
  companion object {
    const val AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK = 3
    const val AUDIOFOCUS_REQUEST_GRANTED = 1
    const val STREAM_MUSIC = 3
  }
}
class AudioFormat {
  class Builder {
    fun setEncoding(value: Int) = this
    fun setSampleRate(value: Int) = this
    fun setChannelMask(value: Int) = this
    fun build() = AudioFormat()
  }
  companion object { const val CHANNEL_OUT_MONO = 4; const val ENCODING_PCM_16BIT = 2; const val ENCODING_PCM_FLOAT = 4 }
}
class PlaybackParams(var speed: Float = 1f, var pitch: Float = 1f) {
  fun setSpeed(value: Float) = apply { speed = value }
  fun setPitch(value: Float) = apply { pitch = value }
}
class AudioTrack {
  val playbackHeadPosition: Long = Long.MAX_VALUE
  var playbackParams = PlaybackParams()
  class Builder {
    fun setAudioAttributes(attributes: AudioAttributes) = this
    fun setAudioFormat(format: AudioFormat) = this
    fun setBufferSizeInBytes(value: Int) = this
    fun setTransferMode(value: Int) = this
    fun build() = AudioTrack()
  }
  fun write(samples: FloatArray, offset: Int, size: Int, mode: Int): Int = size
  fun write(samples: ShortArray, offset: Int, size: Int): Int = size
  fun play() {}
  fun stop() {}
  fun release() {}
  companion object {
    const val MODE_STATIC = 0
    const val MODE_STREAM = 1
    const val WRITE_BLOCKING = 1
    @JvmStatic fun getMinBufferSize(sampleRate: Int, channel: Int, encoding: Int): Int = 1024
  }
}
class MediaPlayer {
  var playbackParams = PlaybackParams()
  fun setAudioAttributes(attributes: AudioAttributes) {}
  fun setVolume(left: Float, right: Float) {}
  fun setDataSource(fd: FileDescriptor) {}
  fun prepare() {}
  fun setNextMediaPlayer(next: MediaPlayer) {}
  fun setOnErrorListener(listener: OnErrorListener) {}
  fun setOnCompletionListener(listener: OnCompletionListener) {}
  fun start() {}
  fun stop() {}
  fun release() {}
  fun interface OnErrorListener { fun onError(player: MediaPlayer, what: Int, extra: Int): Boolean }
  fun interface OnCompletionListener { fun onCompletion(player: MediaPlayer) }
}
