package paperbox.dustmedia.org

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray

class FoldersWidgetService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
    FolderRemoteViewsFactory(applicationContext)
}

private class FolderRemoteViewsFactory(
  private val context: Context,
) : RemoteViewsService.RemoteViewsFactory {
  private var folders: List<FolderWidgetItem> = emptyList()

  override fun onCreate() {
    loadFolders()
  }

  override fun onDataSetChanged() {
    loadFolders()
  }

  override fun onDestroy() {
    folders = emptyList()
  }

  override fun getCount(): Int = folders.size

  override fun getViewAt(position: Int): RemoteViews? {
    val folder = folders.getOrNull(position) ?: return null
    return RemoteViews(context.packageName, R.layout.widget_folder_row).apply {
      setTextViewText(R.id.folder_name, folder.name)
      setTextViewText(R.id.folder_count, "${folder.fileCount} files")
      setOnClickFillInIntent(
        R.id.folder_row,
        Intent().putExtra(WidgetActionStore.EXTRA_FOLDER_ID, folder.id),
      )
    }
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 1
  override fun getItemId(position: Int): Long = position.toLong()
  override fun hasStableIds(): Boolean = true

  private fun loadFolders() {
    val raw = context
      .getSharedPreferences(PaperBoxWidgetRegistry.PREFERENCES, Context.MODE_PRIVATE)
      .getString(PaperBoxWidgetRegistry.FOLDERS_KEY, "[]")
      ?: "[]"

    folders = try {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val id = item.optString("id").takeIf { it.isNotBlank() } ?: return@mapNotNull null
        val name = item.optString("name", "Untitled folder")
        FolderWidgetItem(id, name, item.optInt("fileCount", 0))
      }
    } catch (_: Exception) {
      emptyList()
    }
  }
}

private data class FolderWidgetItem(
  val id: String,
  val name: String,
  val fileCount: Int,
)
