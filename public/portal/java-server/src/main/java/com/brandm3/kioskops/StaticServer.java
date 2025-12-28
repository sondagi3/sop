package com.brandm3.kioskops;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.io.File;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;

public class StaticServer {
  public static void main(String[] args) throws Exception {
    int port = 8787;
    // Determine portal root in a robust way:
// - If index.html exists in the current working directory, serve from here
// - Else if it exists in the parent directory, serve from parent (recommended: run from java-server/)
// - Else fallback to current directory
File cwd = new File(".").getCanonicalFile();
File parent = cwd.getParentFile();
File rootCandidateA = new File(cwd, "index.html");
File rootCandidateB = (parent != null) ? new File(parent, "index.html") : null;
File root = rootCandidateA.exists() ? cwd : (rootCandidateB != null && rootCandidateB.exists() ? parent : cwd);
String rootDir = root.getCanonicalPath();
System.out.println("Serving portal root: " + rootDir);
 // serve the portal root folder
    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

    server.createContext("/", ex -> handle(ex, rootDir));
    server.setExecutor(null);
    System.out.println("KioskOps Portal running at http://localhost:" + port + "/index.html");
    System.out.println("Serving from: " + rootDir);
    server.start();
  }

  private static void handle(HttpExchange ex, String rootDir) throws IOException {
    String uriPath = ex.getRequestURI().getPath();
    if (uriPath.equals("/")) uriPath = "/index.html";

    // Prevent path traversal
    Path base = Path.of(rootDir).normalize();
    Path target = base.resolve(uriPath.substring(1)).normalize();
    if (!target.startsWith(base)) {
      send(ex, 403, "Forbidden");
      return;
    }
    if (!Files.exists(target) || Files.isDirectory(target)) {
      send(ex, 404, "Not Found: " + uriPath);
      return;
    }

    byte[] data = Files.readAllBytes(target);
    Headers h = ex.getResponseHeaders();
    h.set("Content-Type", mime(target.toString()));
    h.set("Cache-Control", "no-store");
    ex.sendResponseHeaders(200, data.length);
    try (OutputStream os = ex.getResponseBody()) {
      os.write(data);
    }
  }

  private static void send(HttpExchange ex, int code, String body) throws IOException {
    byte[] data = body.getBytes();
    ex.sendResponseHeaders(code, data.length);
    try (OutputStream os = ex.getResponseBody()) { os.write(data); }
  }

  private static String mime(String p) {
    p = p.toLowerCase();
    if (p.endsWith(".html")) return "text/html; charset=utf-8";
    if (p.endsWith(".css")) return "text/css; charset=utf-8";
    if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
    if (p.endsWith(".json")) return "application/json; charset=utf-8";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    if (p.endsWith(".pdf")) return "application/pdf";
    if (p.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (p.endsWith(".zip")) return "application/zip";
    return "application/octet-stream";
  }
}
