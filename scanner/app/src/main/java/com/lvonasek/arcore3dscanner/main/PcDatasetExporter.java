package com.lvonasek.arcore3dscanner.main;

import android.content.Context;
import android.os.Build;
import android.preference.PreferenceManager;
import android.util.Log;

import com.lvonasek.arcore3dscanner.BuildConfig;
import com.lvonasek.arcore3dscanner.ui.AbstractActivity;
import com.lvonasek.utils.IO;

import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

public final class PcDatasetExporter {
  private static final String TAG = AbstractActivity.TAG;

  public static final class Result {
    public boolean ok;
    public String message;
    public File zipFile;
    public File exportDir;
    public long totalBytes;
  }

  private PcDatasetExporter() {
  }

  public static Result export(Context context, File datasetDir) {
    Result result = new Result();
    result.ok = false;

    try {
      if ((context == null) || (datasetDir == null) || !datasetDir.exists() || !datasetDir.isDirectory()) {
        result.message = "Dataset missing";
        return result;
      }

      File exportDir = getExportDir(context);
      if (!exportDir.exists() && !exportDir.mkdirs()) {
        result.message = "Unable to create export directory";
        return result;
      }
      result.exportDir = exportDir;

      DatasetInfo info = inspectDataset(context, datasetDir);
      if (!info.valid) {
        result.message = info.errorMessage;
        return result;
      }

      String timestamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
      String zipName = "scan-session-" + timestamp + ".zip";
      File stagingDir = new File(exportDir, ".staging-" + timestamp);
      if (stagingDir.exists()) {
        AbstractActivity.deleteRecursive(stagingDir);
      }
      if (!stagingDir.mkdirs()) {
        result.message = "Unable to create staging directory";
        return result;
      }

      try {
        copyDatasetIntoStaging(datasetDir, stagingDir, info);
        writeMetadataJson(context, stagingDir, info);
        writeCaptureLog(stagingDir, info);

        File zipFile = new File(exportDir, zipName);
        if (zipFile.exists() && !zipFile.delete()) {
          result.message = "Unable to replace existing ZIP";
          return result;
        }

        ArrayList<String> filesToZip = new ArrayList<>();
        for (File file : listFiles(stagingDir)) {
          if (file.isFile()) {
            filesToZip.add(file.getAbsolutePath());
          }
        }
        IO.zip(filesToZip, zipFile.getAbsolutePath());
        result.zipFile = zipFile;
        result.totalBytes = zipFile.length();
        result.ok = true;
        result.message = "Dataset ZIP created";
        return result;
      } finally {
        AbstractActivity.deleteRecursive(stagingDir);
      }
    } catch (Exception e) {
      Log.e(TAG, "[PC_DATASET] Export failed", e);
      result.message = e.getMessage() == null ? "Export failed" : e.getMessage();
      return result;
    }
  }

  public static File getExportDir(Context context) {
    File base = context.getExternalFilesDir(null);
    if (base == null) {
      base = context.getFilesDir();
    }
    return new File(base, "pc-datasets");
  }

  public static void writeMetadataToDataset(Context context, File datasetDir) throws Exception {
    DatasetInfo info = inspectDataset(context, datasetDir);
    if (!info.valid) {
      throw new IllegalStateException(info.errorMessage == null ? "Dataset invalid" : info.errorMessage);
    }
    writeMetadataJson(context, datasetDir, info);
    File captureLog = new File(datasetDir, "capture_log.txt");
    if (!captureLog.exists()) {
      writeCaptureLog(datasetDir, info);
    }
  }

  private static void copyDatasetIntoStaging(File datasetDir, File stagingDir, DatasetInfo info) {
    for (File file : listFiles(datasetDir)) {
      if (!shouldInclude(file)) {
        continue;
      }
      File target = new File(stagingDir, file.getName());
      IO.copy(file, target);
    }
  }

  private static boolean shouldInclude(File file) {
    String name = file.getName().toLowerCase(Locale.US);
    return name.endsWith(".jpg")
            || name.endsWith(".jpeg")
            || name.endsWith(".mat")
            || name.endsWith(".tms")
            || name.endsWith(".pcl")
            || name.equals("state.txt")
            || name.equals("distortion.txt")
            || name.equals("rotation.txt")
            || name.equals("position.txt");
  }

  private static void writeMetadataJson(Context context, File stagingDir, DatasetInfo info) throws Exception {
    JSONObject metadata = new JSONObject();
    metadata.put("dataset_format_version", "1.0");
    metadata.put("source", "SiteReady Scan Android");
    metadata.put("created_at", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US).format(new Date()));
    metadata.put("device_model", valueOrNull(Build.MODEL));
    metadata.put("android_version", valueOrNull(Build.VERSION.RELEASE));
    metadata.put("app_version", BuildConfig.VERSION_NAME);
    metadata.put("build_name", BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")");
    metadata.put("frame_count_expected", info.stateCount >= 0 ? info.stateCount : 0);
    metadata.put("frame_count_saved", info.frameCountSaved);
    metadata.put("has_pointcloud", true);
    metadata.put("has_timestamps", true);
    metadata.put("has_distortion", info.hasDistortion);
    metadata.put("has_rotation", info.hasRotation);
    metadata.put("scan_quality_profile", valueOrNull(info.scanQualityProfile));
    metadata.put("scan_variant_id", "base-scan-with-pc-export");
    metadata.put("scan_variant_label", "SiteReady Scan BASE");
    metadata.put("export_quality_profile", valueOrNull(info.exportQualityProfile));
    metadata.put("dataset_root_name", valueOrNull(info.datasetDir.getName()));
    metadata.put("total_size_bytes", info.totalSizeBytes);

    File file = new File(stagingDir, "metadata.json");
    try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
      writer.write(metadata.toString(2));
      writer.newLine();
    }
  }

  private static void writeCaptureLog(File stagingDir, DatasetInfo info) throws Exception {
    File file = new File(stagingDir, "capture_log.txt");
    try (BufferedWriter writer = new BufferedWriter(new FileWriter(file))) {
      writer.write("SiteReady Scan PC dataset export\n");
      writer.write("dataset_root=" + info.datasetDir.getAbsolutePath() + "\n");
      writer.write("frame_count_saved=" + info.frameCountSaved + "\n");
      writer.write("state_count=" + info.stateCount + "\n");
      writer.write("total_size_bytes=" + info.totalSizeBytes + "\n");
      writer.write("has_distortion=" + info.hasDistortion + "\n");
      writer.write("has_rotation=" + info.hasRotation + "\n");
      writer.write("source=Android app-specific export\n");
    }
  }

  private static DatasetInfo inspectDataset(Context context, File datasetDir) {
    DatasetInfo info = new DatasetInfo();
    info.datasetDir = datasetDir;
    info.scanQualityProfile = PreferenceManager.getDefaultSharedPreferences(context).getString(context.getString(com.lvonasek.arcore3dscanner.R.string.pref_scan_quality), null);
    info.exportQualityProfile = PreferenceManager.getDefaultSharedPreferences(context).getString(context.getString(com.lvonasek.arcore3dscanner.R.string.pref_export_quality), null);
    info.totalSizeBytes = 0;
    info.hasDistortion = new File(datasetDir, "distortion.txt").exists();
    info.hasRotation = new File(datasetDir, "rotation.txt").exists();

    File stateFile = new File(datasetDir, "state.txt");
    if (!stateFile.exists()) {
      info.valid = false;
      info.errorMessage = "state.txt missing";
      return info;
    }

    try {
      String[] parts = IOUtils.readText(stateFile).trim().split("\\s+");
      if (parts.length < 7) {
        info.valid = false;
        info.errorMessage = "state.txt invalid";
        return info;
      }
      info.stateCount = Integer.parseInt(parts[0]);
      info.width = Integer.parseInt(parts[1]);
      info.height = Integer.parseInt(parts[2]);
      info.cx = Double.parseDouble(parts[3]);
      info.cy = Double.parseDouble(parts[4]);
      info.fx = Double.parseDouble(parts[5]);
      info.fy = Double.parseDouble(parts[6]);
    } catch (Exception e) {
      info.valid = false;
      info.errorMessage = "Unable to read state.txt";
      return info;
    }

    ArrayList<File> files = listFiles(datasetDir);
    int rgb = 0;
    int mat = 0;
    int tms = 0;
    int pcl = 0;
    for (File file : files) {
      info.totalSizeBytes += file.length();
      String name = file.getName().toLowerCase(Locale.US);
      if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
        rgb++;
      } else if (name.endsWith(".mat")) {
        mat++;
      } else if (name.endsWith(".tms")) {
        tms++;
      } else if (name.endsWith(".pcl")) {
        pcl++;
      }
    }

    info.rgbCount = rgb;
    info.poseCount = mat;
    info.timestampCount = tms;
    info.pointcloudCount = pcl;
    info.frameCountSaved = rgb;

    if (rgb == 0 || mat == 0 || pcl == 0 || tms == 0) {
      info.valid = false;
      info.errorMessage = "Dataset incomplete";
      return info;
    }

    if ((info.stateCount > 0) && ((info.stateCount != rgb) || (info.stateCount != mat))) {
      info.valid = false;
      info.errorMessage = "Frame counts do not match state.txt";
      return info;
    }

    info.valid = true;
    return info;
  }

  private static ArrayList<File> listFiles(File root) {
    ArrayList<File> output = new ArrayList<>();
    File[] files = root.listFiles();
    if (files == null) {
      return output;
    }
    for (File file : files) {
      if (file.isFile()) {
        output.add(file);
      }
    }
    return output;
  }

  private static Object valueOrNull(String value) {
    return value == null ? JSONObject.NULL : value;
  }

  private static final class DatasetInfo {
    boolean valid;
    String errorMessage;
    File datasetDir;
    int stateCount = -1;
    int frameCountSaved;
    int rgbCount;
    int poseCount;
    int timestampCount;
    int pointcloudCount;
    int width;
    int height;
    double cx;
    double cy;
    double fx;
    double fy;
    boolean hasDistortion;
    boolean hasRotation;
    String scanQualityProfile;
    String exportQualityProfile;
    long totalSizeBytes;
  }

  private static final class IOUtils {
    private static String readText(File file) throws Exception {
      java.io.StringWriter writer = new java.io.StringWriter();
      try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.FileReader(file))) {
        String line;
        while ((line = reader.readLine()) != null) {
          writer.write(line);
          writer.write('\n');
        }
      }
      return writer.toString();
    }
  }
}
