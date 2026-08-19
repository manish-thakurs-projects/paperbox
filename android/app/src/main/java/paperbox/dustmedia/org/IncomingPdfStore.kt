package paperbox.dustmedia.org

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * Holds one PDF handoff from another Android app until the JavaScript runtime
 * is ready to consume it. The URI is intentionally kept as a temporary
 * content URI; JavaScript copies it into PaperBox's private cache immediately.
 */
object IncomingPdfStore {
  private data class Payload(
    val uri: String,
    val name: String,
    val mimeType: String,
  )

  private var pending: Payload? = null

  @Synchronized
  fun capture(context: Context, intent: Intent?) {
    val payload = extract(context, intent) ?: return
    pending = payload
  }

  @Synchronized
  fun consume(): WritableMap? {
    val payload = pending ?: return null
    pending = null
    return Arguments.createMap().apply {
      putString("uri", payload.uri)
      putString("name", payload.name)
      putString("mimeType", payload.mimeType)
    }
  }

  private fun extract(context: Context, intent: Intent?): Payload? {
    if (intent == null) return null

    val uri = when (intent.action) {
      Intent.ACTION_SEND -> parcelableUri(intent)
      Intent.ACTION_SEND_MULTIPLE -> parcelableUris(intent).firstOrNull()
      Intent.ACTION_VIEW -> intent.data
      else -> null
    } ?: return null

    val name = queryDisplayName(context, uri)
    val mimeType = intent.type
      ?: context.contentResolver.getType(uri)
      ?: "application/pdf"

    // Some file managers incorrectly report application/octet-stream. Accept
    // it only when the provider name/URI still clearly identifies a PDF.
    val isPdf = mimeType.equals("application/pdf", ignoreCase = true) ||
      name.endsWith(".pdf", ignoreCase = true) ||
      uri.toString().substringBefore('?').endsWith(".pdf", ignoreCase = true)
    if (!isPdf) return null

    return Payload(
      uri = uri.toString(),
      name = if (name.isBlank()) "document.pdf" else name,
      mimeType = "application/pdf",
    )
  }

  private fun queryDisplayName(context: Context, uri: Uri): String {
    if (uri.scheme == "file") {
      return uri.lastPathSegment ?: "document.pdf"
    }

    return try {
      context.contentResolver.query(
        uri,
        arrayOf(OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null,
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (index >= 0) cursor.getString(index) ?: "document.pdf" else "document.pdf"
        } else {
          "document.pdf"
        }
      } ?: (uri.lastPathSegment ?: "document.pdf")
    } catch (_: Exception) {
      uri.lastPathSegment ?: "document.pdf"
    }
  }

  @Suppress("DEPRECATION")
  private fun parcelableUri(intent: Intent): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
  }

  @Suppress("DEPRECATION")
  private fun parcelableUris(intent: Intent): ArrayList<Uri> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        ?: arrayListOf()
    } else {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM) ?: arrayListOf()
    }
  }
}
