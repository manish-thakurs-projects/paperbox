package paperbox.dustmedia.org

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

private const val WIDGET_REQUEST_SCAN = 4101
private const val WIDGET_REQUEST_CREATE_PDF = 4102
private const val WIDGET_REQUEST_FOLDERS = 4103
private const val WIDGET_REQUEST_QUICK_SCAN = 4104
private const val WIDGET_REQUEST_QUICK_CREATE_PDF = 4105
private const val WIDGET_REQUEST_QUICK_IMPORT = 4106

abstract class ActionWidgetProvider : AppWidgetProvider() {
  protected abstract val layoutId: Int
  protected abstract val widgetAction: String
  protected abstract val requestCode: Int

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      val views = RemoteViews(context.packageName, layoutId)
      val intent = Intent(context, MainActivity::class.java).apply {
        action = widgetAction
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      views.setOnClickPendingIntent(
        R.id.widget_action,
        PendingIntent.getActivity(context, requestCode, intent, flags),
      )
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}

class ScanWidgetProvider : ActionWidgetProvider() {
  override val layoutId: Int = R.layout.widget_scan
  override val widgetAction: String = WidgetActionStore.ACTION_SCAN
  override val requestCode: Int = WIDGET_REQUEST_SCAN
}

class CreatePdfWidgetProvider : ActionWidgetProvider() {
  override val layoutId: Int = R.layout.widget_create_pdf
  override val widgetAction: String = WidgetActionStore.ACTION_CREATE_PDF
  override val requestCode: Int = WIDGET_REQUEST_CREATE_PDF
}

class QuickActionsWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      val views = RemoteViews(context.packageName, R.layout.widget_quick_actions)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

      val scanIntent = Intent(context, MainActivity::class.java).apply {
        action = WidgetActionStore.ACTION_SCAN
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      val createPdfIntent = Intent(context, MainActivity::class.java).apply {
        action = WidgetActionStore.ACTION_CREATE_PDF
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      val importIntent = Intent(context, MainActivity::class.java).apply {
        action = WidgetActionStore.ACTION_IMPORT
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

      views.setOnClickPendingIntent(
        R.id.widget_scan_action,
        PendingIntent.getActivity(context, WIDGET_REQUEST_QUICK_SCAN, scanIntent, flags),
      )
      views.setOnClickPendingIntent(
        R.id.widget_create_pdf_action,
        PendingIntent.getActivity(
          context,
          WIDGET_REQUEST_QUICK_CREATE_PDF,
          createPdfIntent,
          flags,
        ),
      )
      views.setOnClickPendingIntent(
        R.id.widget_import_action,
        PendingIntent.getActivity(context, WIDGET_REQUEST_QUICK_IMPORT, importIntent, flags),
      )
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }
}

class FoldersWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      val views = RemoteViews(context.packageName, R.layout.widget_folders)
      val serviceIntent = Intent(context, FoldersWidgetService::class.java)
      views.setRemoteAdapter(R.id.folder_list, serviceIntent)
      views.setEmptyView(R.id.folder_list, R.id.folders_empty)

      val clickIntent = Intent(context, MainActivity::class.java).apply {
        action = WidgetActionStore.ACTION_OPEN_FOLDER
        addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }
      // Collection widget rows use fill-in intents to add the selected folder ID.
      // Android 12+ requires the template PendingIntent to be mutable for those
      // row extras to be merged into the launch intent.
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      views.setPendingIntentTemplate(
        R.id.folder_list,
        PendingIntent.getActivity(context, WIDGET_REQUEST_FOLDERS, clickIntent, flags),
      )
      appWidgetManager.updateAppWidget(appWidgetId, views)
      appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.folder_list)
    }
  }
}

object PaperBoxWidgetRegistry {
  const val PREFERENCES = "paperbox_widgets"
  const val FOLDERS_KEY = "folders"

  fun refreshFolders(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val provider = ComponentName(context, FoldersWidgetProvider::class.java)
    val ids = manager.getAppWidgetIds(provider)
    if (ids.isNotEmpty()) {
      manager.notifyAppWidgetViewDataChanged(ids, R.id.folder_list)
    }
  }
}
