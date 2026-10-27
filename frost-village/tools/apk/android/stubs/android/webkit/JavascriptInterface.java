// COMPILE-ONLY STUB (tools/apk): android.webkit.JavascriptInterface is API 17, newer than the API 16 stub android.jar
// the app compiles against. It is on javac's class path only and is never dexed or packed: the phone's own framework
// annotation is used at run time (WebView exposes only methods carrying it to the page, API 17+; minSdk is 24).
// Declaration as in the Android SDK (runtime retention, on methods).
package android.webkit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD})
public @interface JavascriptInterface {
}
