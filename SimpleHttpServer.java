import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.io.*;
import java.net.InetSocketAddress;

public class SimpleHttpServer {
    public static void main(String[] args) throws Exception {
        int port = 8080;
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/", new HttpHandler() {
            @Override
            public void handle(HttpExchange exchange) throws IOException {
                String path = exchange.getRequestURI().getPath();
                if (path == null || path.equals("/") || path.isEmpty()) {
                    path = "/index.html";
                }
                
                File file = new File("src" + path);
                if (!file.exists()) {
                    if (path.startsWith("/release/")) {
                        file = new File("." + path);
                    } else if (path.startsWith("/store_assets/")) {
                        file = new File("." + path);
                    } else {
                        file = new File("." + path);
                    }
                }

                if (!file.exists() || file.isDirectory()) {
                    String response = "404 Not Found: " + path;
                    byte[] bytes = response.getBytes("UTF-8");
                    exchange.sendResponseHeaders(404, bytes.length);
                    OutputStream os = exchange.getResponseBody();
                    os.write(bytes);
                    os.close();
                    return;
                }

                String lower = path.toLowerCase();
                String mime = "application/octet-stream";
                if (lower.endsWith(".html")) mime = "text/html; charset=UTF-8";
                else if (lower.endsWith(".css")) mime = "text/css; charset=UTF-8";
                else if (lower.endsWith(".js")) mime = "application/javascript; charset=UTF-8";
                else if (lower.endsWith(".json")) mime = "application/json; charset=UTF-8";
                else if (lower.endsWith(".png")) mime = "image/png";
                else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
                else if (lower.endsWith(".svg")) mime = "image/svg+xml";
                else if (lower.endsWith(".ico")) mime = "image/x-icon";
                else if (lower.endsWith(".apk")) mime = "application/vnd.android.package-archive";
                else if (lower.endsWith(".aab")) mime = "application/octet-stream";

                exchange.getResponseHeaders().set("Content-Type", mime);
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
                exchange.sendResponseHeaders(200, file.length());

                try (OutputStream os = exchange.getResponseBody();
                     FileInputStream fis = new FileInputStream(file)) {
                    byte[] buffer = new byte[65536];
                    int count;
                    while ((count = fis.read(buffer)) > 0) {
                        os.write(buffer, 0, count);
                    }
                }
            }
        });
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
        System.out.println("=================================================");
        System.out.println("  Ludo X BD Server is running on Port " + port);
        System.out.println("  Local URL:  http://localhost:" + port);
        System.out.println("  Mobile URL: http://192.168.0.101:" + port);
        System.out.println("=================================================");
    }
}
