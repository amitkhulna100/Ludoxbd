package com.ludoxbd.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String TAG = "LudoXBD";
    private WebView webView;

    public class AndroidBridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> {
                finishAffinity();
            });
        }

        @JavascriptInterface
        public void shareGame(String shareText, String shareTitle) {
            runOnUiThread(() -> {
                try {
                    Intent sendIntent = new Intent();
                    sendIntent.setAction(Intent.ACTION_SEND);
                    sendIntent.putExtra(Intent.EXTRA_TEXT, shareText);
                    sendIntent.setType("text/plain");
                    Intent shareIntent = Intent.createChooser(sendIntent, (shareTitle != null && !shareTitle.isEmpty()) ? shareTitle : "Share Ludo X BD");
                    startActivity(shareIntent);
                } catch (Exception e) {
                    Log.e(TAG, "Error opening share sheet: " + e.getMessage());
                }
            });
        }

        @JavascriptInterface
        public void rateGame() {
            runOnUiThread(() -> {
                try {
                    Uri marketUri = Uri.parse("market://details?id=" + getPackageName());
                    Intent marketIntent = new Intent(Intent.ACTION_VIEW, marketUri);
                    marketIntent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY | Intent.FLAG_ACTIVITY_NEW_DOCUMENT | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
                    startActivity(marketIntent);
                } catch (Exception e) {
                    try {
                        Uri webUri = Uri.parse("https://play.google.com/store/apps/details?id=" + getPackageName());
                        Intent webIntent = new Intent(Intent.ACTION_VIEW, webUri);
                        startActivity(webIntent);
                    } catch (Exception ex) {
                        Toast.makeText(MainActivity.this, "Unable to open Google Play Store", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void vibrate(long ms) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    if (vm != null) {
                        vm.getDefaultVibrator().vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    if (v != null) {
                        v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                    }
                } else {
                    Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    if (v != null) {
                        v.vibrate(ms);
                    }
                }
            } catch (Exception ignored) {}
        }

        // ==========================================
        // Google AdMob Native Interface
        // ==========================================
        @JavascriptInterface
        public boolean showRewardedAd() {
            runOnUiThread(() -> {
                Log.d(TAG, "Native showRewardedAd invoked");
                // When native Ads SDK is ready, show rewarded ad
                // Callback to JS on reward:
                webView.evaluateJavascript("if (window.adMobManager) window.adMobManager.launchRewardedSimulator();", null);
            });
            return true;
        }

        @JavascriptInterface
        public void showBannerAd() {
            runOnUiThread(() -> {
                Log.d(TAG, "Native showBannerAd invoked");
            });
        }

        @JavascriptInterface
        public void hideBannerAd() {
            runOnUiThread(() -> {
                Log.d(TAG, "Native hideBannerAd invoked");
            });
        }

        @JavascriptInterface
        public void showInterstitialAd() {
            runOnUiThread(() -> {
                Log.d(TAG, "Native showInterstitialAd invoked");
            });
        }

        // ==========================================
        // Google Play Games Services (PGS v2) Interface
        // ==========================================
        @JavascriptInterface
        public void signInPlayGames() {
            runOnUiThread(() -> {
                Log.d(TAG, "Native signInPlayGames invoked");
                // Native callback simulator / PGS integration
                String playerId = "G:" + Math.abs(System.currentTimeMillis() % 100000000L);
                String playerName = "LudoBD Gamer";
                webView.evaluateJavascript("if (window.onPlayGamesSignInSuccess) window.onPlayGamesSignInSuccess('" + playerId + "', '" + playerName + "', '');", null);
            });
        }

        @JavascriptInterface
        public void signOutPlayGames() {
            runOnUiThread(() -> {
                Log.d(TAG, "Native signOutPlayGames invoked");
            });
        }

        @JavascriptInterface
        public void saveGameToCloud(String jsonPayload) {
            runOnUiThread(() -> {
                Log.d(TAG, "Native saveGameToCloud: payload length = " + (jsonPayload != null ? jsonPayload.length() : 0));
                webView.evaluateJavascript("if (window.onCloudSaveCompleted) window.onCloudSaveCompleted(" + System.currentTimeMillis() + ");", null);
            });
        }

        @JavascriptInterface
        public boolean isPlayGamesSignedIn() {
            return false;
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            requestWindowFeature(Window.FEATURE_NO_TITLE);
        } catch (Exception ignored) {}

        try {
            applyImmersiveMode();
        } catch (Exception ignored) {}

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF0F172A);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setDefaultTextEncodingName("UTF-8");
        settings.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Register Native Android Bridge
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                Log.e(TAG, "WebResourceError: " + error.getDescription());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, consoleMessage.message() + " -- From line " +
                        consoleMessage.lineNumber() + " of " + consoleMessage.sourceId());
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                result.confirm();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                result.confirm();
                return true;
            }
        });

        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        // Register modern OnBackInvokedCallback for Android 13+ (API 33-36)
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleHardwareBack
                );
            } catch (Exception ignored) {}
        }

        loadGame();
    }

    private void loadGame() {
        try {
            webView.loadUrl("file:///android_asset/index.html");
        } catch (Exception e) {
            Log.e(TAG, "loadGame error: " + e.getMessage());
        }
    }

    private void applyImmersiveMode() {
        try {
            Window window = getWindow();
            if (window == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false);
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
                View decorView = window.getDecorView();
                if (decorView != null) {
                    decorView.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                    );
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "applyImmersiveMode error: " + e.getMessage());
        }
    }

    public void handleHardwareBack() {
        if (webView != null) {
            webView.evaluateJavascript("if (window.onHardwareBackPressed) { window.onHardwareBackPressed(); } else { 'unhandled'; }", value -> {
                if ("\"unhandled\"".equals(value) || "unhandled".equals(value)) {
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        finish();
                    }
                }
            });
        } else {
            finish();
        }
    }

    @Override
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT < 33) {
            handleHardwareBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
            webView.evaluateJavascript("if (window.soundFX && window.soundFX.onAppPause) { window.soundFX.onAppPause(); }", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyImmersiveMode();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            webView.evaluateJavascript("if (window.soundFX && window.soundFX.onAppResume) { window.soundFX.onAppResume(); }", null);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveMode();
        }
    }
}
