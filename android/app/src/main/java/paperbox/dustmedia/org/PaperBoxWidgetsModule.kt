package paperbox.dustmedia.org

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject

class PaperBoxWidgetsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "PaperBoxWidgets"

  @ReactMethod
  fun getPendingAction(promise: Promise) {
    try {
      promise.resolve(WidgetActionStore.consume())
    } catch (error: Exception) {
      promise.reject("WIDGET_ACTION_ERROR", error)
    }
  }

  @ReactMethod
  fun setFolders(folders: ReadableArray, promise: Promise) {
    try {
      val json = JSONArray()
      for (index in 0 until folders.size()) {
        val item = folders.getMap(index) ?: continue
        val id = item.getString("id") ?: continue
        val name = item.getString("name") ?: "Untitled folder"
        json.put(JSONObject().apply {
          put("id", id)
          put("name", name)
        })
      }

      reactContext
        .getSharedPreferences(PaperBoxWidgetRegistry.PREFERENCES, Context.MODE_PRIVATE)
        .edit()
        .putString(PaperBoxWidgetRegistry.FOLDERS_KEY, json.toString())
        .apply()

      PaperBoxWidgetRegistry.refreshFolders(reactContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("WIDGET_SYNC_ERROR", error)
    }
  }
}
