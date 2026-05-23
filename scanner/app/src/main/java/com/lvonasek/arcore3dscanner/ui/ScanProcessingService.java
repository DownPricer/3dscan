package com.lvonasek.arcore3dscanner.ui;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.IBinder;
import android.preference.PreferenceManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.lvonasek.arcore3dscanner.R;
import com.lvonasek.arcore3dscanner.main.Exporter;
import com.lvonasek.arcore3dscanner.main.JNI;
import com.lvonasek.arcore3dscanner.main.Main;
import com.lvonasek.arcore3dscanner.main.PcDatasetExporter;
import com.lvonasek.arcore3dscanner.main.ScanSessionMetadata;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ScanProcessingService extends Service {

  private static final class CancellationException extends Exception {
    CancellationException() {
      super("Processing cancelled");
    }
  }

  private static final String ACTION_CANCEL = "com.lvonasek.arcore3dscanner.action.CANCEL_SCAN_PROCESSING";
  private static final String ACTION_START = "com.lvonasek.arcore3dscanner.action.START_SCAN_PROCESSING";

  private static final String EXTRA_ANALYSE = "extra_analyse";
  private static final String EXTRA_DATASET_PATH = "extra_dataset_path";
  private static final String EXTRA_EXPORT_MODE = "extra_export_mode";
  private static final String EXTRA_OPERATION = "extra_operation";
  private static final String EXTRA_POISSON = "extra_poisson";
  private static final String EXTRA_STATE = "extra_state";

  private static final String OP_POSTPROCESS = "postprocess";
  private static final String OP_SAVE_DATASET = "save_dataset";
  private static final String OP_SAVE_DEFERRED_RAW = "save_deferred_raw";
  private static final String OP_SAVE_PC_DATASET = "save_pc_dataset";
  private static final String OP_SAVE_MODEL = "save_model";
  private static final String OP_SAVE_TEXTURED_SCAN = "save_textured_scan";

  private static final int NOTIFICATION_ID = 3001;
  private static final String CHANNEL_ID = "scan_processing";
  private static final Pattern PROGRESS_PATTERN = Pattern.compile("(\\d+)\\s*/\\s*(\\d+)");

  private static final AtomicBoolean active = new AtomicBoolean(false);
  private static final AtomicBoolean cancelRequested = new AtomicBoolean(false);

  private NotificationManagerCompat notificationManager;
  private Thread messageThread;
  private Thread workerThread;
  private volatile String fallbackDetail = "";
  private volatile String workflowLabel = "";
  private volatile ScanWorkflowState workflowState = ScanWorkflowState.IDLE;
  private volatile boolean workerFinished = false;
  private volatile boolean pcExportMode = false;
  private int currentServiceState = com.lvonasek.arcore3dscanner.ui.Service.SERVICE_NOT_RUNNING;

  public static boolean isRunning(Context context) {
    return com.lvonasek.arcore3dscanner.ui.Service.getRunning(context) > com.lvonasek.arcore3dscanner.ui.Service.SERVICE_NOT_RUNNING;
  }

  public static void requestCancel(Context context) {
    com.lvonasek.arcore3dscanner.ui.Service.backgroundRequestCancel(context);
    ContextCompat.startForegroundService(context, new Intent(context, ScanProcessingService.class).setAction(ACTION_CANCEL));
  }

  public static boolean startPostprocess(Context context, String datasetPath, String exportMode, boolean poisson, boolean analyseImages) {
    if (isRunning(context)) {
      return false;
    }
    Intent intent = new Intent(context, ScanProcessingService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_OPERATION, OP_POSTPROCESS);
    intent.putExtra(EXTRA_STATE, com.lvonasek.arcore3dscanner.ui.Service.SERVICE_POSTPROCESS);
    intent.putExtra(EXTRA_DATASET_PATH, datasetPath);
    intent.putExtra(EXTRA_EXPORT_MODE, exportMode);
    intent.putExtra(EXTRA_POISSON, poisson);
    intent.putExtra(EXTRA_ANALYSE, analyseImages);
    com.lvonasek.arcore3dscanner.ui.Service.backgroundStart(context,
            com.lvonasek.arcore3dscanner.ui.Service.SERVICE_POSTPROCESS,
            context.getString(R.string.scan_processing_notification_title));
    com.lvonasek.arcore3dscanner.ui.Service.backgroundSetRetry(context, datasetPath, exportMode, poisson, analyseImages);
    ContextCompat.startForegroundService(context, intent);
    return true;
  }

  /**
   * Opens {@link Main} with the saved {@code .dataset} so the original JNI path + postprocess pipeline runs
   * (reconstruction, image analysis, texturing). Requires {@code state.txt} in the dataset folder.
   */
  public static boolean startAnalyzeSavedDataset(Context context, String datasetAbsolutePath) {
    if (isRunning(context)) {
      return false;
    }
    File ds = new File(datasetAbsolutePath);
    if (!ds.isDirectory() || !ds.getAbsolutePath().endsWith(Exporter.EXT_DATASET)) {
      return false;
    }
    if (!new File(ds, "state.txt").exists()) {
      return false;
    }
    ScanSessionMetadata.Info meta = ScanSessionMetadata.readInfo(ds);
    if (meta != null && ScanSessionMetadata.STATUS_PROCESSED_MODEL.equals(meta.status)) {
      return false;
    }
    SharedPreferences pref = PreferenceManager.getDefaultSharedPreferences(context);
    pref.edit()
            .putBoolean(context.getString(R.string.pref_later), true)
            .putString(context.getString(R.string.pref_mode), "realtime")
            .commit();
    Intent intent = new Intent(context, Main.class);
    intent.putExtra(AbstractActivity.FILE_KEY, ds.getAbsolutePath());
    context.startActivity(intent);
    return true;
  }

  public static boolean startSaveDeferredRawDataset(Context context) {
    if (isRunning(context)) {
      return false;
    }
    Intent intent = new Intent(context, ScanProcessingService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_OPERATION, OP_SAVE_DEFERRED_RAW);
    intent.putExtra(EXTRA_STATE, com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE);
    com.lvonasek.arcore3dscanner.ui.Service.backgroundStart(context,
            com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE,
            context.getString(R.string.scan_processing_notification_title));
    ContextCompat.startForegroundService(context, intent);
    return true;
  }

  public static boolean startSaveModel(Context context) {
    if (isRunning(context)) {
      return false;
    }
    Intent intent = new Intent(context, ScanProcessingService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_OPERATION, OP_SAVE_MODEL);
    intent.putExtra(EXTRA_STATE, com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE);
    com.lvonasek.arcore3dscanner.ui.Service.backgroundStart(context,
            com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE,
            context.getString(R.string.scan_processing_notification_title));
    ContextCompat.startForegroundService(context, intent);
    return true;
  }

  public static boolean startSaveTexturedScan(Context context, boolean poisson, boolean analyseImages) {
    if (isRunning(context)) {
      return false;
    }
    Intent intent = new Intent(context, ScanProcessingService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_OPERATION, OP_SAVE_TEXTURED_SCAN);
    intent.putExtra(EXTRA_STATE, com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE);
    intent.putExtra(EXTRA_POISSON, poisson);
    intent.putExtra(EXTRA_ANALYSE, analyseImages);
    com.lvonasek.arcore3dscanner.ui.Service.backgroundStart(context,
            com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE,
            context.getString(R.string.scan_processing_notification_title));
    ContextCompat.startForegroundService(context, intent);
    return true;
  }

  public static boolean startSaveDataset(Context context) {
    if (isRunning(context)) {
      return false;
    }
    Intent intent = new Intent(context, ScanProcessingService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_OPERATION, OP_SAVE_DATASET);
    intent.putExtra(EXTRA_STATE, com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE);
    com.lvonasek.arcore3dscanner.ui.Service.backgroundStart(context,
            com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE,
            context.getString(R.string.scan_processing_notification_title));
    ContextCompat.startForegroundService(context, intent);
    return true;
  }

  public static boolean startSavePcDataset(Context context) {
    if (isRunning(context)) {
      return false;
    }
    Intent intent = new Intent(context, ScanProcessingService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_OPERATION, OP_SAVE_PC_DATASET);
    intent.putExtra(EXTRA_STATE, com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE);
    com.lvonasek.arcore3dscanner.ui.Service.backgroundStart(context,
            com.lvonasek.arcore3dscanner.ui.Service.SERVICE_SAVE,
            context.getString(R.string.scan_processing_notification_title));
    ContextCompat.startForegroundService(context, intent);
    return true;
  }

  @Override
  public void onCreate() {
    super.onCreate();
    notificationManager = NotificationManagerCompat.from(this);
    createNotificationChannel();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      return START_NOT_STICKY;
    }

    if (ACTION_CANCEL.equals(intent.getAction())) {
      cancelRequested.set(true);
      com.lvonasek.arcore3dscanner.ui.Service.backgroundRequestCancel(this);
      updateNotification(getString(R.string.scan_processing_cancelling), true);
      return START_STICKY;
    }

    if (!ACTION_START.equals(intent.getAction())) {
      return START_NOT_STICKY;
    }

    if (!active.compareAndSet(false, true)) {
      Log.w(AbstractActivity.TAG, "Scan processing already running");
      return START_STICKY;
    }

    cancelRequested.set(false);
    workerFinished = false;
    pcExportMode = OP_SAVE_PC_DATASET.equals(intent.getStringExtra(EXTRA_OPERATION));
    currentServiceState = intent.getIntExtra(EXTRA_STATE, com.lvonasek.arcore3dscanner.ui.Service.SERVICE_POSTPROCESS);
    workflowState = ScanWorkflowState.IDLE;
    workflowLabel = getString(R.string.scan_processing_stage_prepare);
    fallbackDetail = "";
    startForeground(NOTIFICATION_ID, buildNotification(workflowLabel, true));
    startMessageLoop();

    workerThread = new Thread(() -> {
      try {
        String operation = intent.getStringExtra(EXTRA_OPERATION);
        if (OP_SAVE_MODEL.equals(operation)) {
          runSaveModel();
        } else if (OP_SAVE_TEXTURED_SCAN.equals(operation)) {
          runSaveTexturedScan(intent);
        } else if (OP_SAVE_DATASET.equals(operation)) {
          runSaveDataset();
        } else if (OP_SAVE_DEFERRED_RAW.equals(operation)) {
          runSaveDeferredRaw();
        } else if (OP_SAVE_PC_DATASET.equals(operation)) {
          runSavePcDataset();
        } else {
          runPostprocess(intent);
        }
      } catch (CancellationException cancelled) {
        Log.i(AbstractActivity.TAG, "Background scan processing cancelled");
      } catch (Throwable t) {
        Log.e(AbstractActivity.TAG, "Background scan processing failed", t);
        String message = t.getMessage();
        if ((message == null) || message.trim().isEmpty()) {
          message = getString(R.string.scan_processing_error_notification);
        }
        updateState(ScanWorkflowState.ERROR, getString(R.string.scan_processing_error_notification), message);
        com.lvonasek.arcore3dscanner.ui.Service.backgroundError(this, currentServiceState, message);
        updateFinishedNotification(getString(R.string.scan_processing_error_notification), message, false);
      } finally {
        workerFinished = true;
        active.set(false);
        stopMessageLoop();
        stopSelf();
      }
    }, "scan-processing-worker");
    workerThread.start();
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    workerFinished = true;
    stopMessageLoop();
    super.onDestroy();
  }

  @Nullable
  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void runSaveModel() throws CancellationException {
    updateState(ScanWorkflowState.PROCESSING_GEOMETRY, getString(R.string.scan_processing_stage_prepare));
    JNI.motionTrackingMessages = false;
    JNI.onToggleButtonClicked(false);
    ensureNotCancelled();

    updateState(ScanWorkflowState.PROCESSING_GEOMETRY, getString(R.string.scan_processing_stage_export));
    File input = new File(AbstractActivity.getTempPath(), "model" + Exporter.EXT_OBJ);
    if (!JNI.save(input.getAbsolutePath().getBytes())) {
      throw new IllegalStateException("Unable to save current model");
    }
    ensureNotCancelled();

    updateState(ScanWorkflowState.VALIDATING_EXPORT, getString(R.string.scan_processing_stage_validate));
    File output = Exporter.export(input, createTimestamp());
    if (output == null) {
      throw new IllegalStateException("Unable to export saved model");
    }
    finishSuccess(output);
  }

  private void runSaveDataset() throws CancellationException {
    File output = saveRawDatasetFolder();
    finishSuccess(output);
  }

  private void runSaveDeferredRaw() throws CancellationException {
    File folder = saveRawDatasetFolder();
    ensureNotCancelled();
    int frameCount = ScanSessionMetadata.readFrameCountFromDataset(folder);
    try {
      ScanSessionMetadata.writeNewPending(folder, null, frameCount);
    } catch (Exception e) {
      throw new IllegalStateException("Unable to write scan_session.json", e);
    }
    finishSuccess(folder);
  }

  private void runSavePcDataset() throws CancellationException {
    Log.i(AbstractActivity.TAG, "[PC_EXPORT] Starting PC dataset export");
    Log.i(AbstractActivity.TAG, "[PC_EXPORT] Saving raw dataset only");
    Log.i(AbstractActivity.TAG, "[PC_EXPORT] Skipping image analysis on phone");
    Log.i(AbstractActivity.TAG, "[PC_EXPORT] Skipping texturing on phone");

    File datasetFolder = saveRawDatasetFolder();
    ensureNotCancelled();

    updateState(ScanWorkflowState.SAVING_PC_DATASET, getString(R.string.scan_processing_stage_saving_pc_dataset));
    try {
      PcDatasetExporter.writeMetadataToDataset(this, datasetFolder);
    } catch (Exception e) {
      throw new IllegalStateException(e.getMessage() == null ? "Unable to write metadata.json" : e.getMessage(), e);
    }
    ensureNotCancelled();

    updateState(ScanWorkflowState.CREATING_PC_ZIP, getString(R.string.scan_processing_stage_creating_pc_zip));
    PcDatasetExporter.Result exportResult = PcDatasetExporter.export(this, datasetFolder);
    if (!exportResult.ok || (exportResult.zipFile == null)) {
      throw new IllegalStateException(exportResult.message == null ? "PC ZIP export failed" : exportResult.message);
    }

    Log.i(AbstractActivity.TAG, "[PC_EXPORT] metadata.json written");
    Log.i(AbstractActivity.TAG, "[PC_EXPORT] zip created: " + exportResult.zipFile.getAbsolutePath());
    Log.i(AbstractActivity.TAG, "[PC_EXPORT] done");
    finishPcSuccess(exportResult.zipFile);
  }

  private File saveRawDatasetFolder() throws CancellationException {
    updateState(ScanWorkflowState.SCAN_FINISHED, getString(R.string.scan_processing_stage_prepare));
    JNI.motionTrackingMessages = false;
    JNI.onToggleButtonClicked(false);
    ensureNotCancelled();

    File tempPath = AbstractActivity.getTempPath();
    File input = new File(tempPath, "model" + Exporter.EXT_OBJ);
    if (!JNI.save(input.getAbsolutePath().getBytes())) {
      throw new IllegalStateException("Unable to save current scan dataset");
    }
    ensureNotCancelled();

    updateState(ScanWorkflowState.VALIDATING_EXPORT, getString(R.string.scan_processing_stage_finalize));
    String timestamp = createTimestamp();
    File partial = new File(AbstractActivity.getPath(false), timestamp + Exporter.EXT_DATASET + ".partial");
    File output = new File(AbstractActivity.getPath(false), timestamp + Exporter.EXT_DATASET);
    if (partial.exists()) {
      AbstractActivity.deleteRecursive(partial);
    }
    if (output.exists()) {
      AbstractActivity.deleteRecursive(output);
    }
    if (!tempPath.renameTo(partial)) {
      throw new IllegalStateException("Unable to move temporary dataset");
    }
    File[] files = partial.listFiles();
    if (files != null) {
      for (File file : files) {
        if (file.getAbsolutePath().endsWith(".bin")) {
          //noinspection ResultOfMethodCallIgnored
          file.delete();
        }
      }
    }
    if (!partial.renameTo(output)) {
      throw new IllegalStateException("Unable to finalize saved dataset");
    }
    return output;
  }

  private void runSaveTexturedScan(Intent intent) throws CancellationException {
    boolean poisson = intent.getBooleanExtra(EXTRA_POISSON, false);
    boolean analyseImages = intent.getBooleanExtra(EXTRA_ANALYSE, false);
    String timestamp = createTimestamp();

    updateState(ScanWorkflowState.SCAN_FINISHED, getString(R.string.scan_processing_stage_prepare));
    JNI.motionTrackingMessages = false;
    JNI.onToggleButtonClicked(false);
    ensureNotCancelled();

    File tempDir = AbstractActivity.getTempPath();
    if (!tempDir.exists()) {
      //noinspection ResultOfMethodCallIgnored
      tempDir.mkdirs();
    }

    updateState(ScanWorkflowState.PROCESSING_GEOMETRY, getString(R.string.scan_processing_stage_prepare));
    File input = new File(tempDir, "processing_input" + Exporter.EXT_OBJ);
    if (!JNI.save(input.getAbsolutePath().getBytes())) {
      throw new IllegalStateException("Unable to save temporary model before texturing");
    }
    ensureNotCancelled();

    updateState(ScanWorkflowState.ANALYZING_IMAGES, getString(R.string.scan_processing_stage_analyse));
    File output = new File(tempDir, timestamp + Exporter.EXT_OBJ);
    JNI.texturize(input.getAbsolutePath().getBytes(), output.getAbsolutePath().getBytes(), poisson, analyseImages);
    if (!output.exists() || output.length() == 0L) {
      throw new IllegalStateException(getProcessingFailure("Texture generation failed"));
    }
    ensureNotCancelled();

    updateState(ScanWorkflowState.VALIDATING_EXPORT, getString(R.string.scan_processing_stage_validate));
    File exported = Exporter.export(output, timestamp);
    validateTexturedExport(exported);
    finishSuccess(exported);
  }

  private void runPostprocess(Intent intent) throws CancellationException {
    String datasetPath = intent.getStringExtra(EXTRA_DATASET_PATH);
    String exportMode = intent.getStringExtra(EXTRA_EXPORT_MODE);
    boolean poisson = intent.getBooleanExtra(EXTRA_POISSON, false);
    boolean analyseImages = intent.getBooleanExtra(EXTRA_ANALYSE, false);
    String timestamp = createTimestamp();

    File deferredDatasetForMetadata = null;
    if ("realtime".equals(exportMode) && datasetPath != null && datasetPath.endsWith(Exporter.EXT_DATASET)) {
      deferredDatasetForMetadata = new File(datasetPath);
      if (ScanSessionMetadata.readInfo(deferredDatasetForMetadata) != null) {
        ScanSessionMetadata.markAnalyzing(deferredDatasetForMetadata);
      }
    }

    File exported;
    try {
      updateState(ScanWorkflowState.SCAN_FINISHED, getString(R.string.scan_processing_stage_prepare));
      JNI.motionTrackingMessages = false;
      ensureNotCancelled();

      if ("exp_floorplan".equals(exportMode)) {
        updateState(ScanWorkflowState.PROCESSING_GEOMETRY, getString(R.string.scan_processing_stage_export));
        String path = datasetPath + "/";
        JNI.extract(path.getBytes(), Exporter.EXPORT_TYPE_FLOORPLAN);
        ensureNotCancelled();
        exported = Exporter.export(new File(datasetPath, "floorplan.obj"), timestamp);
      } else if ("exp_pointcloud".equals(exportMode)) {
        updateState(ScanWorkflowState.PROCESSING_GEOMETRY, getString(R.string.scan_processing_stage_reconstruct));
        JNI.onUndoButtonClicked(false, true);
        ensureNotCancelled();
        updateState(ScanWorkflowState.PROCESSING_GEOMETRY, getString(R.string.scan_processing_stage_export));
        String path = datasetPath + "/";
        JNI.extract((path + "pointcloud.ply").getBytes(), Exporter.EXPORT_TYPE_POINTCLOUD);
        ensureNotCancelled();
        exported = Exporter.export(new File(datasetPath, "pointcloud.ply"), timestamp);
      } else {
        updateState(ScanWorkflowState.PROCESSING_GEOMETRY, getString(R.string.scan_processing_stage_reconstruct));
        JNI.onUndoButtonClicked(false, false);
        ensureNotCancelled();

        File tempDir = AbstractActivity.getTempPath();
        if (!tempDir.exists()) {
          //noinspection ResultOfMethodCallIgnored
          tempDir.mkdirs();
        }
        File input = new File(tempDir, "processing_input" + Exporter.EXT_OBJ);
        if (!JNI.save(input.getAbsolutePath().getBytes())) {
          throw new IllegalStateException("Unable to save temporary model before texturing");
        }
        ensureNotCancelled();

        updateState(ScanWorkflowState.ANALYZING_IMAGES, getString(R.string.scan_processing_stage_analyse));
        File output = new File(tempDir, timestamp + Exporter.EXT_OBJ);
        JNI.texturize(input.getAbsolutePath().getBytes(), output.getAbsolutePath().getBytes(), poisson, analyseImages);
        if (!output.exists() || output.length() == 0L) {
          throw new IllegalStateException(getProcessingFailure("Texture generation failed"));
        }
        ensureNotCancelled();

        updateState(ScanWorkflowState.VALIDATING_EXPORT, getString(R.string.scan_processing_stage_validate));
        exported = Exporter.export(output, timestamp);
      }

      if ((exported == null) || !exported.exists()) {
        throw new IllegalStateException("Unable to export processed scan");
      }
      if (exported.getAbsolutePath().endsWith(Exporter.EXT_OBJ)) {
        validateTexturedExport(exported);
      }
      if (deferredDatasetForMetadata != null && "realtime".equals(exportMode)
              && exported.getAbsolutePath().endsWith(Exporter.EXT_OBJ)) {
        ScanSessionMetadata.markProcessed(deferredDatasetForMetadata, exported.getName());
      }
      finishSuccess(exported);
    } catch (CancellationException e) {
      restoreDeferredDatasetMetadata(deferredDatasetForMetadata, exportMode);
      throw e;
    } catch (RuntimeException e) {
      restoreDeferredDatasetMetadata(deferredDatasetForMetadata, exportMode);
      throw e;
    }
  }

  private static void restoreDeferredDatasetMetadata(File datasetDir, String exportMode) {
    if (datasetDir == null || !"realtime".equals(exportMode)) {
      return;
    }
    ScanSessionMetadata.Info info = ScanSessionMetadata.readInfo(datasetDir);
    if (info != null && ScanSessionMetadata.STATUS_ANALYZING_ON_PHONE.equals(info.status)) {
      ScanSessionMetadata.markRawPendingRestored(datasetDir);
    }
  }

  private void startMessageLoop() {
    stopMessageLoop();
    messageThread = new Thread(() -> {
      while (!workerFinished) {
        try {
          Thread.sleep(1000);
        } catch (InterruptedException e) {
          return;
        }
        String event = JNI.getEvent(getResources());
        applyNativeEvent(event);
        String notificationText = formatNotificationText();
        if (cancelRequested.get() || com.lvonasek.arcore3dscanner.ui.Service.backgroundIsCancelRequested(this)) {
          notificationText = getString(R.string.scan_processing_cancelling);
        }
        updateNotification(notificationText, true);
      }
    }, "scan-processing-progress");
    messageThread.start();
  }

  private void stopMessageLoop() {
    if (messageThread != null) {
      messageThread.interrupt();
      messageThread = null;
    }
  }

  private void ensureNotCancelled() throws CancellationException {
    if (cancelRequested.get() || com.lvonasek.arcore3dscanner.ui.Service.backgroundIsCancelRequested(this)) {
      updateState(ScanWorkflowState.ERROR, getString(R.string.scan_processing_cancelled_notification),
              getString(R.string.scan_processing_cancelled_notification));
      com.lvonasek.arcore3dscanner.ui.Service.backgroundError(this, currentServiceState,
              getString(R.string.scan_processing_cancelled_notification));
      updateFinishedNotification(getString(R.string.scan_processing_cancelled_notification),
              getString(R.string.scan_processing_tap_to_return), false);
      throw new CancellationException();
    }
  }

  private void updateNotification(String stage, boolean ongoing) {
    notificationManager.notify(NOTIFICATION_ID, buildNotification(stage, ongoing));
  }

  private void updateFinishedNotification(String title, String message, boolean success) {
    com.lvonasek.arcore3dscanner.ui.Service.backgroundUpdateWorkflow(this, workflowState, workflowLabel, message);
    stopForeground(false);
    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(createOpenAppPendingIntent())
            .setAutoCancel(true)
            .setOngoing(false)
            .setOnlyAlertOnce(false)
            .setPriority(success ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_HIGH);
    notificationManager.notify(NOTIFICATION_ID, builder.build());
  }

  private NotificationCompat.Builder baseNotificationBuilder(String stage, boolean ongoing) {
    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(getString(R.string.scan_processing_notification_title))
            .setContentText(stage)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(stage))
            .setContentIntent(createOpenAppPendingIntent())
            .setOnlyAlertOnce(true)
            .setOngoing(ongoing)
            .setPriority(NotificationCompat.PRIORITY_LOW);
    PendingIntent cancelIntent = PendingIntent.getService(
            this,
            1,
            new Intent(this, ScanProcessingService.class).setAction(ACTION_CANCEL),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    builder.addAction(android.R.drawable.ic_delete, getString(R.string.scan_processing_cancel_action), cancelIntent);
    return builder;
  }

  private android.app.Notification buildNotification(String stage, boolean ongoing) {
    NotificationCompat.Builder builder = baseNotificationBuilder(stage, ongoing);
    Matcher matcher = PROGRESS_PATTERN.matcher(stage);
    if (matcher.find()) {
      try {
        int current = Integer.parseInt(matcher.group(1));
        int total = Integer.parseInt(matcher.group(2));
        if (total > 0) {
          builder.setProgress(total, Math.min(current, total), false);
        } else {
          builder.setProgress(0, 0, true);
        }
      } catch (NumberFormatException e) {
        builder.setProgress(0, 0, true);
      }
    } else {
      builder.setProgress(0, 0, true);
    }
    return builder.build();
  }

  private PendingIntent createOpenAppPendingIntent() {
    Intent intent = new Intent(this, FileManager.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    return PendingIntent.getActivity(this, 2, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
              CHANNEL_ID,
              getString(R.string.scan_processing_channel_name),
              NotificationManager.IMPORTANCE_LOW);
      channel.setDescription(getString(R.string.scan_processing_channel_description));
      NotificationManager manager = getSystemService(NotificationManager.class);
      if (manager != null) {
        manager.createNotificationChannel(channel);
      }
    }
  }

  private String createTimestamp() {
    return new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
  }

  private void applyNativeEvent(String translatedEvent) {
    String detail = translatedEvent == null ? "" : translatedEvent.trim();
    if (!detail.isEmpty()) {
      updateState(workflowState, workflowLabel, detail);
    } else if (fallbackDetail.isEmpty() && !workflowLabel.isEmpty()) {
      updateState(workflowState, workflowLabel, workflowLabel);
    }
  }

  private void finishSuccess(File output) {
    updateState(ScanWorkflowState.READY, getString(R.string.scan_processing_stage_ready),
            getString(R.string.scan_processing_ready_notification));
    com.lvonasek.arcore3dscanner.ui.Service.backgroundFinish(this, output.getAbsolutePath(), currentServiceState);
    updateFinishedNotification(getString(R.string.scan_processing_ready_notification),
            getString(R.string.scan_processing_tap_to_return), true);
  }

  private void finishPcSuccess(File zipFile) {
    String detail = zipFile.getAbsolutePath() + "\n" + getString(R.string.pc_export_share_hint);
    updateState(ScanWorkflowState.READY_PC_DATASET, getString(R.string.scan_processing_stage_ready_pc_dataset), detail);
    com.lvonasek.arcore3dscanner.ui.Service.backgroundFinish(this, zipFile.getAbsolutePath(), currentServiceState);
    updateFinishedNotification(getString(R.string.scan_processing_ready_pc_notification),
            detail, true);
  }

  private String formatNotificationText() {
    if ((fallbackDetail != null) && !fallbackDetail.isEmpty() && !fallbackDetail.equals(workflowLabel)) {
      return workflowLabel + "\n" + fallbackDetail;
    }
    return workflowLabel;
  }

  private String getProcessingFailure(String fallback) {
    return fallback;
  }

  private String getWorkflowLabel(ScanWorkflowState state) {
    switch (state) {
      case SCAN_FINISHED:
      case PROCESSING_GEOMETRY:
        return getString(R.string.scan_processing_stage_prepare);
      case ANALYZING_IMAGES:
        return getString(R.string.scan_processing_stage_analyse);
      case GENERATING_TEXTURES:
        return getString(R.string.scan_processing_stage_texture);
      case VALIDATING_EXPORT:
        return getString(R.string.scan_processing_stage_validate);
      case READY:
        return getString(R.string.scan_processing_stage_ready);
      case SAVING_PC_DATASET:
        return getString(R.string.scan_processing_stage_saving_pc_dataset);
      case CREATING_PC_ZIP:
        return getString(R.string.scan_processing_stage_creating_pc_zip);
      case READY_PC_DATASET:
        return getString(R.string.scan_processing_stage_ready_pc_dataset);
      case ERROR:
        return getString(R.string.scan_processing_error_notification);
      case SCANNING:
      case IDLE:
      default:
        return getString(R.string.scan_processing_stage_prepare);
    }
  }

  private void updateState(ScanWorkflowState state, String label) {
    updateState(state, label, fallbackDetail);
  }

  private void updateState(ScanWorkflowState state, String label, String detail) {
    if (state != workflowState) {
      Log.i(AbstractActivity.TAG, "[WORKFLOW] State: " + state.name());
    }
    workflowState = state;
    workflowLabel = label == null ? "" : label;
    fallbackDetail = detail == null ? "" : detail;
    com.lvonasek.arcore3dscanner.ui.Service.backgroundUpdateWorkflow(this, workflowState, workflowLabel, fallbackDetail);
    updateNotification(formatNotificationText(), true);
  }

  private void validateTexturedExport(File exported) {
    if ((exported == null) || !exported.exists()) {
      throw new IllegalStateException("Unable to export processed scan");
    }
    TextureExportValidator.Result result = TextureExportValidator.validate(
            exported,
            -1,
            -1);
    if (!result.ok) {
      throw new IllegalStateException(result.errorMessage);
    }
  }
}
