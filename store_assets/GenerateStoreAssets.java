import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

public class GenerateStoreAssets {
    public static void main(String[] args) {
        try {
            System.out.println("Generating Google Play Store marketing assets...");

            // 1. Generate 512x512 App Icon
            generateIcon512();

            // 2. Generate 1024x500 Feature Graphic Banner
            generateFeatureGraphic1024x500();

            // 3. Generate 5 Promotional Screenshots (1080x1920 portrait standard)
            generateScreenshots();

            System.out.println("All store assets successfully created in store_assets/");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void generateIcon512() throws Exception {
        BufferedImage icon = new BufferedImage(512, 512, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = icon.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);

        File srcIcon = new File("src/assets/app_icon.png");
        if (srcIcon.exists()) {
            BufferedImage orig = ImageIO.read(srcIcon);
            g.drawImage(orig, 0, 0, 512, 512, null);
        } else {
            // High quality fallback icon render
            g.setColor(new Color(15, 23, 42));
            g.fillRoundRect(0, 0, 512, 512, 96, 96);
            g.setColor(new Color(245, 158, 11));
            g.setFont(new Font("SansSerif", Font.BOLD, 120));
            g.drawString("LUDO", 100, 240);
            g.setColor(new Color(239, 68, 68));
            g.drawString("X BD", 120, 370);
        }
        g.dispose();
        ImageIO.write(icon, "png", new File("store_assets/icon_512x512.png"));
        System.out.println("Generated: store_assets/icon_512x512.png (512x512)");
    }

    private static void generateFeatureGraphic1024x500() throws Exception {
        int w = 1024, h = 500;
        BufferedImage banner = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = banner.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        // Rich Dark Royal Gradient Background
        GradientPaint bg = new GradientPaint(0, 0, new Color(10, 15, 30), w, h, new Color(15, 23, 50));
        g.setPaint(bg);
        g.fillRect(0, 0, w, h);

        // Ambient board neon quadrants in background
        g.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, 0.18f));
        g.setColor(new Color(34, 197, 94));  // Green
        g.fillOval(-100, -100, 360, 360);
        g.setColor(new Color(234, 179, 8));  // Yellow
        g.fillOval(w - 260, -100, 360, 360);
        g.setColor(new Color(239, 68, 68));  // Red
        g.fillOval(-100, h - 260, 360, 360);
        g.setColor(new Color(59, 130, 246)); // Blue
        g.fillOval(w - 260, h - 260, 360, 360);

        g.setComposite(AlphaComposite.SrcOver);

        // Left Icon Emblem
        File iconFile = new File("store_assets/icon_512x512.png");
        if (iconFile.exists()) {
            BufferedImage icon = ImageIO.read(iconFile);
            g.drawImage(icon, 80, 75, 350, 350, null);
        }

        // Center / Right Typography
        int tx = 480;

        // Title: LUDO X BD
        g.setFont(new Font("SansSerif", Font.BOLD, 74));
        g.setColor(new Color(254, 240, 138));
        g.drawString("LUDO X BD", tx, 150);

        // Bengali Subtitle
        g.setFont(new Font("SansSerif", Font.BOLD, 32));
        g.setColor(new Color(248, 250, 252));
        g.drawString("খাঁটি ক্লাসিক লুডু গেম", tx, 210);

        // Feature Bullets / Badges
        g.setFont(new Font("SansSerif", Font.PLAIN, 22));
        g.setColor(new Color(148, 163, 184));
        g.drawString("★ ১০০% অফলাইন ও কম্পিউটার রোবট মোড", tx, 275);
        g.drawString("★ ডার্ক ও হোয়াইট বোর্ড থিম সিলেক্টর", tx, 315);
        g.drawString("★ খাঁটি বাংলা ধারাভাষ্য ও প্রিমিয়াম আইভরি ডাইস", tx, 355);
        g.drawString("★ ২v২ টিম মোড এবং পাস অ্যান্ড প্লে", tx, 395);

        // Download pill badge
        g.setColor(new Color(37, 99, 235));
        g.fillRoundRect(tx, 420, 260, 48, 24, 24);
        g.setColor(Color.WHITE);
        g.setFont(new Font("SansSerif", Font.BOLD, 20));
        g.drawString("Google Play Launch", tx + 30, 452);

        g.dispose();
        ImageIO.write(banner, "png", new File("store_assets/feature_graphic_1024x500.png"));
        System.out.println("Generated: store_assets/feature_graphic_1024x500.png (1024x500)");
    }

    private static void generateScreenshots() throws Exception {
        int sw = 1080, sh = 1920;
        String[] titles = {
            "LUDO X BD",
            "CLASSIC DARK BOARD",
            "WHITE THEME BOARD",
            "DAILY LUCKY SPIN",
            "VICTORY & REWARDS"
        };
        String[] bngSubtitles = {
            "বাংলাদেশের সেরা লুডু গেম - ১০০% অফলাইন ও ফ্রি",
            "স্মুথ ৬০fps এনিমেশন ও বাস্তবসম্মত হাতির দাঁতের ডাইস",
            "চোখের আরামের জন্য ক্লাসিক হোয়াইট বোর্ড থিম",
            "দৈনিক চাকা ঘুরিয়ে জিতে নিন ফ্রি কয়েন ও পুরস্কার",
            "চ্যাম্পিয়ন হন এবং বন্ধুদের সাথে শেয়ার করুন"
        };

        Color[] accents = {
            new Color(245, 158, 11),
            new Color(56, 189, 248),
            new Color(34, 197, 94),
            new Color(236, 72, 153),
            new Color(234, 179, 8)
        };

        for (int i = 0; i < 5; i++) {
            BufferedImage shot = new BufferedImage(sw, sh, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = shot.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

            // Rich Modern Gradient BG
            GradientPaint bg = new GradientPaint(0, 0, new Color(15, 23, 42), sw, sh, new Color(2, 6, 23));
            g.setPaint(bg);
            g.fillRect(0, 0, sw, sh);

            // Top Header Banner
            g.setColor(accents[i]);
            g.setFont(new Font("SansSerif", Font.BOLD, 68));
            FontMetrics fm = g.getFontMetrics();
            int tw = fm.stringWidth(titles[i]);
            g.drawString(titles[i], (sw - tw) / 2, 180);

            g.setColor(Color.WHITE);
            g.setFont(new Font("SansSerif", Font.BOLD, 36));
            FontMetrics fmb = g.getFontMetrics();
            int subw = fmb.stringWidth(bngSubtitles[i]);
            g.drawString(bngSubtitles[i], (sw - subw) / 2, 250);

            // Simulated Device Frame in Center
            int fx = 110, fy = 340, fw = 860, fh = 1480;
            g.setColor(new Color(30, 41, 59));
            g.fillRoundRect(fx - 12, fy - 12, fw + 24, fh + 24, 52, 52);
            g.setColor(new Color(15, 23, 42));
            g.fillRoundRect(fx, fy, fw, fh, 40, 40);

            // Inner visual
            File cardImg = null;
            if (i == 0) cardImg = new File("src/assets/images/card_mode_computer.png");
            else if (i == 1) cardImg = new File("src/assets/images/card_mode_playnplay.png");
            else if (i == 2) cardImg = new File("src/assets/images/card_mode_team.png");
            else if (i == 3) cardImg = new File("src/assets/images/card_mode_friends.png");
            else if (i == 4) cardImg = new File("src/assets/images/card_mode_online.png");

            if (cardImg != null && cardImg.exists()) {
                BufferedImage cImg = ImageIO.read(cardImg);
                int imgW = 740;
                int imgH = (int) (cImg.getHeight() * ((double) imgW / cImg.getWidth()));
                g.drawImage(cImg, fx + (fw - imgW) / 2, fy + 160, imgW, imgH, null);
            }

            // Inset details
            g.setColor(accents[i]);
            g.fillRoundRect(fx + 60, fy + fh - 240, fw - 120, 140, 24, 24);
            g.setColor(new Color(15, 23, 42));
            g.setFont(new Font("SansSerif", Font.BOLD, 42));
            String badgeText = "★ Ludo X BD Official Release ★";
            FontMetrics fmbadge = g.getFontMetrics();
            g.drawString(badgeText, fx + 60 + (fw - 120 - fmbadge.stringWidth(badgeText)) / 2, fy + fh - 155);

            g.dispose();
            String path = "store_assets/screenshots/screenshot_" + (i + 1) + ".png";
            ImageIO.write(shot, "png", new File(path));
            System.out.println("Generated: " + path + " (1080x1920)");
        }
    }
}
