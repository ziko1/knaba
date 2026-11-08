package de.knaba.mobile;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.XmlResourceParser;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.Drawable;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.xmlpull.v1.XmlPullParser;

import java.io.File;
import java.io.FileOutputStream;

import static org.junit.Assert.*;

/** Compiled Android resources rendered by Robolectric native graphics, not a device screenshot. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, qualifiers = "mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class LauncherIconTest {
    private static final String ANDROID_NS = "http://schemas.android.com/apk/res/android";

    @Test public void packagedLauncherAndRoundIconsInflateAndRenderCompanyMark() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        PackageManager packages = context.getPackageManager();
        Intent launcher = packages.getLaunchIntentForPackage(context.getPackageName());
        assertNotNull("The packaged app must expose a launcher activity", launcher);
        Drawable launcherIcon = packages.getActivityIcon(launcher);

        String manifestPackage = null;
        int roundIconResource = 0;
        // AssetManager reads the binary manifest from the tested resource APK. Do not
        // substitute source XML, an R constant or a mocked package-manager icon here.
        try (XmlResourceParser manifest = context.getAssets().openXmlResourceParser("AndroidManifest.xml")) {
            for (int event = manifest.getEventType(); event != XmlPullParser.END_DOCUMENT; event = manifest.next()) {
                if (event != XmlPullParser.START_TAG) continue;
                if ("manifest".equals(manifest.getName())) {
                    manifestPackage = manifest.getAttributeValue(null, "package");
                } else if ("application".equals(manifest.getName())) {
                    roundIconResource = manifest.getAttributeResourceValue(ANDROID_NS, "roundIcon", 0);
                }
            }
        }
        assertEquals("Icon metadata must belong to the tested app", BuildConfig.APPLICATION_ID, manifestPackage);
        assertNotEquals("The compiled manifest must supply a round launcher icon", 0, roundIconResource);
        Drawable roundIcon = context.getResources().getDrawable(roundIconResource, context.getTheme());

        assertTrue("PackageManager must inflate an adaptive launcher icon", launcherIcon instanceof AdaptiveIconDrawable);
        assertTrue("The compiled roundIcon must inflate as adaptive", roundIcon instanceof AdaptiveIconDrawable);
        renderAndCheckCompanyColors(launcherIcon, "launcher-icon-robolectric.png");
        renderAndCheckCompanyColors(roundIcon, "launcher-icon-round-robolectric.png");
    }

    private static void renderAndCheckCompanyColors(Drawable icon, String filename) throws Exception {
        Bitmap image = Bitmap.createBitmap(216, 216, Bitmap.Config.ARGB_8888);
        try {
            icon.setBounds(0, 0, image.getWidth(), image.getHeight());
            icon.draw(new Canvas(image));

            File directory = new File("build/qa");
            assertTrue("Native-render evidence directory must be writable", directory.isDirectory() || directory.mkdirs());
            try (FileOutputStream output = new FileOutputStream(new File(directory, filename))) {
                assertTrue("The native icon render must encode as PNG", image.compress(Bitmap.CompressFormat.PNG, 100, output));
            }

            int teal = 0;
            int lime = 0;
            for (int y = 0; y < image.getHeight(); y++) {
                for (int x = 0; x < image.getWidth(); x++) {
                    int pixel = image.getPixel(x, y);
                    if (Color.alpha(pixel) < 240) continue;
                    int red = Color.red(pixel), green = Color.green(pixel), blue = Color.blue(pixel);
                    if (red < 100 && green > red + 20 && blue > red + 20) teal++;
                    if (green > red + 8 && red > blue + 12 && green > 90) lime++;
                }
            }
            // A resource that inflates but draws blank, loses its bitmap or clips away
            // the lime base must fail; the original teal-and-yellow glyph also fails.
            assertTrue(filename + " must visibly render the teal company buildings", teal > 100);
            assertTrue(filename + " must retain the lime company base", lime > 30);
        } finally {
            image.recycle();
        }
    }
}
