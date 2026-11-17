package com.eunsaebyeog.couplecalendar;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridge.class); // 홈 화면 위젯에 오늘 요약 전달
        super.onCreate(savedInstanceState);
    }
}
