package paperbox.dustmedia.org

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class IncomingPdfModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "IncomingPdf"

  @ReactMethod
  fun getPendingPdf(promise: Promise) {
    try {
      promise.resolve(IncomingPdfStore.consume())
    } catch (error: Exception) {
      promise.reject("INCOMING_PDF_ERROR", error)
    }
  }
}
