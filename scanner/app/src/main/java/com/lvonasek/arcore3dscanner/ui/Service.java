package com.lvonasek.arcore3dscanner.ui;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.IBinder;
import android.preference.PreferenceManager;
import android.util.Log;

import com.lvonasek.arcore3dscanner.main.JNI;

public class Service extends android.app.Service
{
  public static final String SERVICE_LINK = "service_link";
  public static final String SERVICE_MESSAGE = "service_message";
  public static final String SERVICE_ERROR = "service_error";
  public static final String SERVICE_RETRY_ANALYSE = "service_retry_analyse";
  public static final String SERVICE_RETRY_DATASET = "service_retry_dataset";
  public static final String SERVICE_RETRY_EXPORT_MODE = "service_retry_export_mode";
  public static final String SERVICE_RETRY_POISSON = "service_retry_poisson";
  public static final String SERVICE_NOTIFICATION = "service_notification";
  public static final String SERVICE_RUNNING = "service_running";
  public static final String SERVICE_CANCEL = "service_cancel";
  public static final String SERVICE_WORKFLOW_LABEL = "service_workflow_label";
  public static final String SERVICE_WORKFLOW_STATE = "service_workflow_state";

  public static final int SERVICE_NOT_RUNNING = 0;
  public static final int SERVICE_POSTPROCESS = 1;
  public static final int SERVICE_SAVE = 2;
  public static final int SERVICE_SKETCHFAB = 3;
  public static final int SERVICE_PHOTOGRAMMETRY = 4;

  private static Runnable action;
  private static String message;
  private static String messageNotification;
  private static AbstractActivity parent;
  private static boolean running;
  private static Service service;

  private static SharedPreferences prefs(Context context) {
    return PreferenceManager.getDefaultSharedPreferences(context);
  }

  @Override
  public synchronized void onCreate() {
    super.onCreate();
    service = this;
    message = "";
    if (parent == null)
      return;
    if ((getRunning(parent) == SERVICE_POSTPROCESS) || (getRunning(parent) == SERVICE_SAVE)) {
      running = true;
      new Thread(() -> {
        while(running) {
          setMessage(JNI.getEvent(Service.this.getResources()));
          try
          {
            Thread.sleep(1000);
          } catch (Exception e)
          {
            e.printStackTrace();
          }
        }
        message = "";
      }).start();
    }
    new Thread(() -> action.run()).start();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId)
  {
    return START_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent)
  {
    return null;
  }

  public static synchronized void finish(String link)
  {
    running = false;
    service.stopService(new Intent(parent, Service.class));
    SharedPreferences.Editor e = PreferenceManager.getDefaultSharedPreferences(parent).edit();
    e.putInt(SERVICE_RUNNING, -Math.abs(getRunning(parent)));
    e.putString(SERVICE_LINK, link);
    e.commit();
    System.exit(0);
  }

  public static synchronized void forceState(AbstractActivity activity, String link, int state)
  {
    running = false;
    SharedPreferences.Editor e = PreferenceManager.getDefaultSharedPreferences(activity).edit();
    e.putInt(SERVICE_RUNNING, -Math.abs(state));
    e.putString(SERVICE_LINK, link);
    e.commit();
    System.exit(0);
  }

  public static synchronized void interrupt() {
    messageNotification = null;
    message = null;
  }

  public static synchronized void process(String message, int serviceId, AbstractActivity activity, Runnable runnable)
  {
    action = runnable;
    parent = activity;
    messageNotification = message;

    SharedPreferences.Editor e = PreferenceManager.getDefaultSharedPreferences(activity).edit();
    e.putInt(SERVICE_RUNNING, serviceId);
    e.putString(SERVICE_LINK, "");
    e.commit();
    activity.runOnUiThread(() -> activity.startService(new Intent(activity, Service.class)));
  }

  public static synchronized String getLink(Context context)
  {
    return prefs(context).getString(SERVICE_LINK, "");
  }

  public static synchronized String getMessage()
  {
    if (messageNotification == null)
      return null;
    if (message == null)
      return null;
    return messageNotification + "\n" + message;
  }

  public static synchronized String getMessage(Context context)
  {
    SharedPreferences pref = prefs(context);
    String notification = pref.getString(SERVICE_NOTIFICATION, null);
    String current = pref.getString(SERVICE_MESSAGE, null);
    if ((notification == null) || (current == null)) {
      return null;
    }
    return notification + "\n" + current;
  }

  public static synchronized int getRunning(Context context)
  {
    return prefs(context).getInt(SERVICE_RUNNING, SERVICE_NOT_RUNNING);
  }

  private static synchronized void setMessage(String msg)
  {
    message = msg;
  }

  public static synchronized void setMessageNotification(String msg)
  {
    messageNotification = msg;
  }

  public static synchronized void backgroundStart(Context context, int serviceId, String title)
  {
    SharedPreferences.Editor e = prefs(context).edit();
    e.putInt(SERVICE_RUNNING, serviceId);
    e.putString(SERVICE_LINK, "");
    e.putString(SERVICE_NOTIFICATION, title);
    e.putString(SERVICE_MESSAGE, "");
    e.putString(SERVICE_ERROR, "");
    e.putString(SERVICE_WORKFLOW_STATE, ScanWorkflowState.IDLE.name());
    e.putString(SERVICE_WORKFLOW_LABEL, "");
    e.putString(SERVICE_RETRY_DATASET, "");
    e.putString(SERVICE_RETRY_EXPORT_MODE, "");
    e.putBoolean(SERVICE_RETRY_POISSON, false);
    e.putBoolean(SERVICE_RETRY_ANALYSE, false);
    e.putBoolean(SERVICE_CANCEL, false);
    e.commit();
  }

  public static synchronized void backgroundUpdate(Context context, String msg)
  {
    SharedPreferences.Editor e = prefs(context).edit();
    e.putString(SERVICE_MESSAGE, msg == null ? "" : msg);
    e.commit();
  }

  public static synchronized void backgroundUpdateWorkflow(Context context, ScanWorkflowState state, String label, String detail)
  {
    SharedPreferences.Editor e = prefs(context).edit();
    e.putString(SERVICE_WORKFLOW_STATE, state == null ? ScanWorkflowState.IDLE.name() : state.name());
    e.putString(SERVICE_WORKFLOW_LABEL, label == null ? "" : label);
    e.putString(SERVICE_MESSAGE, detail == null ? "" : detail);
    e.commit();
  }

  public static synchronized void backgroundError(Context context, int state, String error)
  {
    SharedPreferences.Editor e = prefs(context).edit();
    e.putInt(SERVICE_RUNNING, -Math.abs(state));
    e.putString(SERVICE_ERROR, error == null ? "" : error);
    e.putString(SERVICE_WORKFLOW_STATE, ScanWorkflowState.ERROR.name());
    e.putBoolean(SERVICE_CANCEL, false);
    e.commit();
  }

  public static synchronized void backgroundFinish(Context context, String link, int state)
  {
    SharedPreferences.Editor e = prefs(context).edit();
    e.putInt(SERVICE_RUNNING, -Math.abs(state));
    e.putString(SERVICE_LINK, link == null ? "" : link);
    e.putString(SERVICE_ERROR, "");
    e.putBoolean(SERVICE_CANCEL, false);
    e.commit();
  }

  public static synchronized boolean backgroundHasError(Context context)
  {
    String error = prefs(context).getString(SERVICE_ERROR, "");
    return (error != null) && !error.isEmpty();
  }

  public static synchronized String backgroundGetWorkflowLabel(Context context)
  {
    return prefs(context).getString(SERVICE_WORKFLOW_LABEL, "");
  }

  public static synchronized ScanWorkflowState backgroundGetWorkflowState(Context context)
  {
    return ScanWorkflowState.fromId(prefs(context).getString(SERVICE_WORKFLOW_STATE, ScanWorkflowState.IDLE.name()));
  }

  public static synchronized String backgroundGetError(Context context)
  {
    return prefs(context).getString(SERVICE_ERROR, "");
  }

  public static synchronized String backgroundGetDetail(Context context)
  {
    return prefs(context).getString(SERVICE_MESSAGE, "");
  }

  public static synchronized String backgroundGetRetryDataset(Context context)
  {
    return prefs(context).getString(SERVICE_RETRY_DATASET, "");
  }

  public static synchronized String backgroundGetRetryExportMode(Context context)
  {
    return prefs(context).getString(SERVICE_RETRY_EXPORT_MODE, "");
  }

  public static synchronized boolean backgroundGetRetryPoisson(Context context)
  {
    return prefs(context).getBoolean(SERVICE_RETRY_POISSON, false);
  }

  public static synchronized boolean backgroundGetRetryAnalyse(Context context)
  {
    return prefs(context).getBoolean(SERVICE_RETRY_ANALYSE, false);
  }

  public static synchronized void backgroundRequestCancel(Context context)
  {
    SharedPreferences.Editor e = prefs(context).edit();
    e.putBoolean(SERVICE_CANCEL, true);
    e.commit();
  }

  public static synchronized boolean backgroundIsCancelRequested(Context context)
  {
    return prefs(context).getBoolean(SERVICE_CANCEL, false);
  }

  public static synchronized void backgroundSetRetry(Context context, String dataset, String exportMode, boolean poisson, boolean analyse)
  {
    SharedPreferences.Editor e = prefs(context).edit();
    e.putString(SERVICE_RETRY_DATASET, dataset == null ? "" : dataset);
    e.putString(SERVICE_RETRY_EXPORT_MODE, exportMode == null ? "" : exportMode);
    e.putBoolean(SERVICE_RETRY_POISSON, poisson);
    e.putBoolean(SERVICE_RETRY_ANALYSE, analyse);
    e.commit();
  }

  public static synchronized void reset(Context context)
  {
    try
    {
      service.stopService(new Intent(parent, Service.class));
    } catch(Exception e)
    {
      e.printStackTrace();
    }
    try
    {
      context.stopService(new Intent(context, ScanProcessingService.class));
    } catch (Exception e)
    {
      e.printStackTrace();
    }
    SharedPreferences.Editor e = prefs(context).edit();
    e.putInt(SERVICE_RUNNING, SERVICE_NOT_RUNNING);
    e.putString(SERVICE_LINK, "");
    e.putString(SERVICE_MESSAGE, "");
    e.putString(SERVICE_NOTIFICATION, "");
    e.putString(SERVICE_ERROR, "");
    e.putString(SERVICE_WORKFLOW_STATE, ScanWorkflowState.IDLE.name());
    e.putString(SERVICE_WORKFLOW_LABEL, "");
    e.putString(SERVICE_RETRY_DATASET, "");
    e.putString(SERVICE_RETRY_EXPORT_MODE, "");
    e.putBoolean(SERVICE_RETRY_POISSON, false);
    e.putBoolean(SERVICE_RETRY_ANALYSE, false);
    e.putBoolean(SERVICE_CANCEL, false);
    e.commit();
  }
}