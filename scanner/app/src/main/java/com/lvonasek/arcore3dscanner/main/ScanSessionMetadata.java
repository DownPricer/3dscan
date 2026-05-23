package com.lvonasek.arcore3dscanner.main;

import android.util.Log;

import com.lvonasek.arcore3dscanner.ui.AbstractActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Lightweight session state stored next to a raw {@code .dataset} folder.
 * Does not affect capture; used only for deferred phone analysis / PC export UX.
 */
public final class ScanSessionMetadata {

  public static final String FILE_NAME = "scan_session.json";

  public static final String STATUS_RAW_PENDING_ANALYSIS = "RAW_PENDING_ANALYSIS";
  public static final String STATUS_ANALYZING_ON_PHONE = "ANALYZING_ON_PHONE";
  public static final String STATUS_PROCESSED_MODEL = "PROCESSED_MODEL";
  public static final String STATUS_PC_EXPORTED = "PC_EXPORTED";

  private ScanSessionMetadata() {
  }

  public static final class Info {
    public String displayName;
    public String status;
    public String createdAtIso;
    public String datasetPath;
    public int frameCount;
    public String processedArtifactName;
    public String lastPcExportZipPath;
    /** {@link #STATUS_PC_EXPORTED} when a PC ZIP was created; does not replace phone workflow status. */
    public String pcExportStatus;
  }

  public static Info readInfo(File datasetDir) {
    File f = new File(datasetDir, FILE_NAME);
    if (!f.exists() || !f.isFile()) {
      return null;
    }
    try (BufferedReader reader = new BufferedReader(new FileReader(f))) {
      StringBuilder sb = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line).append('\n');
      }
      JSONObject o = new JSONObject(sb.toString());
      Info info = new Info();
      info.displayName = o.optString("name", datasetDir.getName());
      info.status = o.optString("status", "");
      info.createdAtIso = o.optString("createdAt", "");
      info.datasetPath = o.optString("datasetPath", datasetDir.getAbsolutePath());
      info.frameCount = o.optInt("frameCount", -1);
      info.processedArtifactName = readOptionalString(o, "processedArtifactName");
      info.lastPcExportZipPath = readOptionalString(o, "lastPcExportZipPath");
      info.pcExportStatus = readOptionalString(o, "pcExportStatus");
      return info;
    } catch (Exception e) {
      Log.w(AbstractActivity.TAG, "[SCAN_SESSION] Unable to read " + f, e);
      return null;
    }
  }

  public static boolean isRawPending(File datasetDir) {
    Info info = readInfo(datasetDir);
    return info != null && STATUS_RAW_PENDING_ANALYSIS.equals(info.status);
  }

  public static void writeNewPending(File datasetDir, String displayName, int frameCount) throws Exception {
    JSONObject o = new JSONObject();
    o.put("name", displayName == null ? datasetDir.getName() : displayName);
    o.put("createdAt", isoNow());
    o.put("status", STATUS_RAW_PENDING_ANALYSIS);
    o.put("datasetPath", datasetDir.getAbsolutePath());
    o.put("frameCount", frameCount);
    File out = new File(datasetDir, FILE_NAME);
    try (BufferedWriter w = new BufferedWriter(new FileWriter(out))) {
      w.write(o.toString(2));
      w.newLine();
    }
  }

  public static void markAnalyzing(File datasetDir) {
    mergeWrite(datasetDir, json -> {
      try {
        json.put("status", STATUS_ANALYZING_ON_PHONE);
        json.put("analyzingStartedAt", isoNow());
      } catch (Exception ignored) {
      }
    });
  }

  public static void markProcessed(File datasetDir, String exportedModelFolderName) {
    mergeWrite(datasetDir, json -> {
      try {
        json.put("status", STATUS_PROCESSED_MODEL);
        json.put("processedArtifactName", exportedModelFolderName);
        json.put("processedAt", isoNow());
      } catch (Exception ignored) {
      }
    });
  }

  public static void markPcExported(File datasetDir, String zipAbsolutePath) {
    mergeWrite(datasetDir, json -> {
      try {
        json.put("lastPcExportZipPath", zipAbsolutePath);
        json.put("lastPcExportAt", isoNow());
        json.put("pcExportStatus", STATUS_PC_EXPORTED);
      } catch (Exception ignored) {
      }
    });
  }

  /** After a failed or cancelled phone analysis, return to “pending” if metadata exists. */
  public static void markRawPendingRestored(File datasetDir) {
    mergeWrite(datasetDir, json -> {
      try {
        json.put("status", STATUS_RAW_PENDING_ANALYSIS);
        json.remove("analyzingStartedAt");
      } catch (Exception ignored) {
      }
    });
  }

  private static String isoNow() {
    return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US).format(new Date());
  }

  private static void mergeWrite(File datasetDir, Patch patch) {
    File f = new File(datasetDir, FILE_NAME);
    JSONObject json = new JSONObject();
    try {
      if (f.exists()) {
        try (BufferedReader reader = new BufferedReader(new FileReader(f))) {
          StringBuilder sb = new StringBuilder();
          String line;
          while ((line = reader.readLine()) != null) {
            sb.append(line).append('\n');
          }
          json = new JSONObject(sb.toString());
        }
      }
      patch.apply(json);
      try (BufferedWriter w = new BufferedWriter(new FileWriter(f))) {
        w.write(json.toString(2));
        w.newLine();
      }
    } catch (Exception e) {
      Log.w(AbstractActivity.TAG, "[SCAN_SESSION] Unable to update " + f, e);
    }
  }

  private interface Patch {
    void apply(JSONObject json) throws Exception;
  }

  /** Best-effort frame count from {@code state.txt} first integer, or -1. */
  private static String readOptionalString(JSONObject o, String key) {
    if (!o.has(key) || o.isNull(key)) {
      return null;
    }
    String value = o.optString(key, "");
    return value.isEmpty() ? null : value;
  }

  public static int readFrameCountFromDataset(File datasetDir) {
    File state = new File(datasetDir, "state.txt");
    if (!state.exists()) {
      return -1;
    }
    try (BufferedReader reader = new BufferedReader(new FileReader(state))) {
      String first = reader.readLine();
      if (first == null) {
        return -1;
      }
      String[] parts = first.trim().split("\\s+");
      if (parts.length < 1) {
        return -1;
      }
      return Integer.parseInt(parts[0]);
    } catch (Exception e) {
      return -1;
    }
  }
}
