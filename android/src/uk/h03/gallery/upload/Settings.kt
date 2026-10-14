package uk.h03.gallery.upload

import android.content.Context

/** The site and the curator's upload key (entered once, kept in app preferences). */
object Settings {
  const val SITE = "https://gallery.h03.uk"
  private const val PREFS = "museum"
  private const val KEY = "uploadKey"

  fun uploadKey(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)

  fun saveUploadKey(context: Context, value: String) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, value).apply()

  fun forgetUploadKey(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
}
