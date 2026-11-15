package okhttp3

import okio.ByteString
import java.util.concurrent.TimeUnit

class OkHttpClient {
  class Builder {
    fun connectTimeout(value: Long, unit: TimeUnit) = this
    fun readTimeout(value: Long, unit: TimeUnit) = this
    fun writeTimeout(value: Long, unit: TimeUnit) = this
    fun retryOnConnectionFailure(value: Boolean) = this
    fun build() = OkHttpClient()
  }
  fun newWebSocket(request: Request, listener: WebSocketListener): WebSocket = WebSocket()
}
class Request {
  class Builder {
    fun url(value: String) = this
    fun header(name: String, value: String) = this
    fun build() = Request()
  }
}
class Response(val code: Int = 200)
open class WebSocketListener {
  open fun onOpen(webSocket: WebSocket, response: Response) {}
  open fun onMessage(webSocket: WebSocket, bytes: ByteString) {}
  open fun onMessage(webSocket: WebSocket, text: String) {}
  open fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {}
  open fun onClosing(webSocket: WebSocket, code: Int, reason: String) {}
  open fun onClosed(webSocket: WebSocket, code: Int, reason: String) {}
}
class WebSocket {
  fun send(text: String): Boolean = true
  fun close(code: Int, reason: String?): Boolean = true
  fun cancel() {}
}
