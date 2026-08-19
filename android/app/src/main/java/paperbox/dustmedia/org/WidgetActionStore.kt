package paperbox.dustmedia.org

import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/** Holds one home-screen widget action until the React Native runtime is ready. */
object WidgetActionStore {
  const val ACTION_SCAN = "paperbox.widget.SCAN"
  const val ACTION_CREATE_PDF = "paperbox.widget.CREATE_PDF"
  const val ACTION_IMPORT = "paperbox.widget.IMPORT"
  const val ACTION_OPEN_FOLDER = "paperbox.widget.OPEN_FOLDER"
  const val EXTRA_FOLDER_ID = "paperbox.widget.FOLDER_ID"

  private data class Payload(
    val action: String,
    val folderId: String? = null,
  )

  private var pending: Payload? = null

  @Synchronized
  fun capture(intent: Intent?) {
    if (intent == null) return

    val action = intent.action ?: return
    val payload = when (action) {
      ACTION_SCAN -> Payload(ACTION_SCAN)
      ACTION_CREATE_PDF -> Payload(ACTION_CREATE_PDF)
      ACTION_IMPORT -> Payload(ACTION_IMPORT)
      ACTION_OPEN_FOLDER -> {
        val folderId = intent.getStringExtra(EXTRA_FOLDER_ID) ?: return
        Payload(ACTION_OPEN_FOLDER, folderId)
      }
      else -> return
    }

    pending = payload
  }

  @Synchronized
  fun consume(): WritableMap? {
    val payload = pending ?: return null
    pending = null
    return Arguments.createMap().apply {
      putString("action", payload.action)
      payload.folderId?.let { putString("folderId", it) }
    }
  }
}
