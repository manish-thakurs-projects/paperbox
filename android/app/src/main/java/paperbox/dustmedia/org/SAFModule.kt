package paperbox.dustmedia.org

import android.app.Activity
import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream

class SAFModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  companion object {
    const val NAME = "SAFModule"
    const val REQUEST_CODE_PICK_TREE = 0x0F01
  }

  private var pickPromise: Promise? = null

  override fun getName(): String = NAME

  init {
    reactContext.addActivityEventListener(this)
  }

  @ReactMethod
  fun pickFolder(promise: Promise) {
    val activity: Activity? = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No activity available to pick folder")
      return
    }

    if (pickPromise != null) {
      promise.reject("BUSY", "A pickFolder request is already in progress")
      return
    }

    try {
      pickPromise = promise
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
      // Let user persist permissions
      intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
      activity.startActivityForResult(intent, REQUEST_CODE_PICK_TREE)
    } catch (e: Exception) {
      pickPromise = null
      promise.reject("PICK_FAILED", e.message)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE_PICK_TREE) return
    val promise = pickPromise ?: return

    try {
      if (resultCode == Activity.RESULT_OK && data != null) {
        val treeUri: Uri? = data.data
        if (treeUri == null) {
          promise.reject("NO_URI", "No uri returned from picker")
        } else {
          // Persist permission
          val flags = (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
          try {
            reactContext.contentResolver.takePersistableUriPermission(treeUri, flags)
          } catch (e: Exception) {
            // ignore if permission already held or not available
          }
          promise.resolve(treeUri.toString())
        }
      } else {
        promise.reject("CANCELLED", "User cancelled folder pick")
      }
    } catch (e: Exception) {
      promise.reject("PICK_ERROR", e.message)
    } finally {
      pickPromise = null
    }
  }

  override fun onNewIntent(intent: Intent) {
    // no-op
  }

  @ReactMethod
  fun writeFileToTree(treeUriStr: String, relativePath: String, base64Data: String, promise: Promise) {
    try {
      val treeUri = Uri.parse(treeUriStr)
      val root = DocumentFile.fromTreeUri(reactContext, treeUri)
      if (root == null || !root.canWrite()) {
        promise.reject("NO_ROOT", "Cannot access tree uri or no write permission")
        return
      }

      val segments = relativePath.split('/').filter { it.isNotEmpty() }
      var current: DocumentFile = root
      for (i in 0 until segments.size - 1) {
        val name = segments[i]
        var next = current.findFile(name)
        if (next == null || !next.isDirectory) {
          next = current.createDirectory(name)
        }
        if (next == null) {
          promise.reject("CREATE_DIR_FAILED", "Failed to create or access directory $name")
          return
        }
        current = next
      }

      val filename = if (segments.isNotEmpty()) segments.last() else "file"

      // Remove existing file if present
      val existing = current.findFile(filename)
      existing?.delete()

      val created = current.createFile("application/octet-stream", filename)
      if (created == null) {
        promise.reject("CREATE_FILE_FAILED", "Failed to create file $filename")
        return
      }

      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      val out = reactContext.contentResolver.openOutputStream(created.uri)
      if (out == null) {
        promise.reject("NO_OUTPUT", "Unable to open output stream for ${created.uri}")
        return
      }
      out.use { stream ->
        stream.write(bytes)
        stream.flush()
      }

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WRITE_ERROR", e.message)
    }
  }

  @ReactMethod
  fun readFileFromTree(treeUriStr: String, relativePath: String, promise: Promise) {
    try {
      val treeUri = Uri.parse(treeUriStr)
      val root = DocumentFile.fromTreeUri(reactContext, treeUri)
      if (root == null) {
        promise.reject("NO_ROOT", "Cannot access tree uri")
        return
      }

      val segments = relativePath.split('/').filter { it.isNotEmpty() }
      var current: DocumentFile = root
      for (i in 0 until segments.size - 1) {
        val name = segments[i]
        val next = current.findFile(name)
        if (next == null || !next.isDirectory) {
          promise.reject("NOT_FOUND", "Directory $name not found")
          return
        }
        current = next
      }

      val filename = if (segments.isNotEmpty()) segments.last() else "file"
      val file = current.findFile(filename)
      if (file == null || !file.isFile) {
        promise.reject("NOT_FOUND", "File $filename not found")
        return
      }

      val input = reactContext.contentResolver.openInputStream(file.uri)
      if (input == null) {
        promise.reject("NO_INPUT", "Cannot open input stream for ${file.uri}")
        return
      }

      val buffer = ByteArrayOutputStream()
      input.use { stream ->
        val tmp = ByteArray(4096)
        var read = stream.read(tmp)
        while (read >= 0) {
          if (read > 0) buffer.write(tmp, 0, read)
          read = stream.read(tmp)
        }
      }

      val bytes = buffer.toByteArray()
      val encoded = Base64.encodeToString(bytes, Base64.NO_WRAP)
      promise.resolve(encoded)
    } catch (e: Exception) {
      promise.reject("READ_ERROR", e.message)
    }
  }
}
