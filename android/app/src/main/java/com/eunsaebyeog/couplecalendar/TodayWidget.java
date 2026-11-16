package com.eunsaebyeog.couplecalendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** 홈 화면 위젯: 오늘의 일정 + 가장 가까운 기념일. 설정의 위젯 켜기/끄기를 그대로 따름. */
public class TodayWidget extends AppWidgetProvider {
    static final String PREFS = "today_widget", KEY = "data";

    static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] ids = m.getAppWidgetIds(new ComponentName(ctx, TodayWidget.class));
        new TodayWidget().onUpdate(ctx, m, ids);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        String title = "우리 캘린더", body = "앱을 열면 오늘 일정이 보여요", anniv = "";
        try {
            JSONObject d = new JSONObject(ctx.getSharedPreferences(PREFS, 0).getString(KEY, "{}"));
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.KOREA).format(new Date());
            if (today.equals(d.optString("date"))) {
                title = d.optString("title", title);
                JSONArray list = d.optJSONArray("today");
                if (list == null) body = "";
                else if (list.length() == 0) body = "오늘 일정이 없어요";
                else {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < list.length(); i++) sb.append(i > 0 ? "\n" : "").append(list.getString(i));
                    body = sb.toString();
                }
                anniv = d.optString("anniv", "");
            } // ponytail: 날짜가 지났으면 앱을 열 때까지 안내 문구. 앱 없이 갱신하려면 WorkManager 로 자정 갱신 추가.
        } catch (Exception ignored) { }

        Intent open = new Intent(ctx, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
            v.setTextViewText(R.id.w_title, title);
            v.setTextViewText(R.id.w_body, body);
            v.setViewVisibility(R.id.w_body, body.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.w_anniv, anniv);
            v.setViewVisibility(R.id.w_anniv, anniv.isEmpty() ? View.GONE : View.VISIBLE);
            v.setOnClickPendingIntent(R.id.w_root, pi);
            manager.updateAppWidget(id, v);
        }
    }
}
