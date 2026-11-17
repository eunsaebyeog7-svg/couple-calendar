package com.eunsaebyeog.couplecalendar;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 웹 화면이 계산한 오늘 요약(JSON)을 저장하고 홈 화면 위젯을 다시 그림. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data", "{}");
        getContext().getSharedPreferences(TodayWidget.PREFS, 0).edit().putString(TodayWidget.KEY, data).apply();
        TodayWidget.refreshAll(getContext());
        call.resolve();
    }
}
