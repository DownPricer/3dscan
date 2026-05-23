package com.lvonasek.arcore3dscanner.ui;

import android.Manifest;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Bundle;
import android.preference.PreferenceManager;
import android.text.Html;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.GridView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.google.ar.core.ArCoreApk;
import com.lvonasek.arcore3dscanner.BuildConfig;
import com.lvonasek.arcore3dscanner.R;
import com.lvonasek.arcore3dscanner.main.Exporter;
import com.lvonasek.arcore3dscanner.main.Main;
import com.lvonasek.arcore3dscanner.main.ScanSessionMetadata;
import com.lvonasek.utils.Compatibility;
import com.lvonasek.utils.IO;

import java.io.File;
import java.util.ArrayList;
import java.util.Locale;

public class FileManager extends AbstractActivity implements View.OnClickListener {
  private FileAdapter mAdapter;
  private GridView mList;
  private Button mAdd;
  private Button mCancel;
  private CheckBox mCheckbox;
  private ProgressBar mProgress;
  private TextView mText;
  private TextView mWorkflowState;
  private RelativeLayout mHeader;
  private LinearLayout mOptions;
  private TextView mName;
  private View mPosition;
  private View mRename;
  private View mShare;
  private View mAnalyzeDeferred;
  private View mPcExport;
  private static boolean allowedToAskForPermissions = true;

  @Override
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.activity_files);

    boolean showPro = Compatibility.isPlayStoreSupported(this) && !isProVersion(this);
    findViewById(R.id.settings).setOnClickListener(this);

    mName = findViewById(R.id.name);
    mRename = findViewById(R.id.rename);
    mPosition = findViewById(R.id.position);
    mShare = findViewById(R.id.share);
    mAnalyzeDeferred = findViewById(R.id.analyze_deferred);
    mPcExport = findViewById(R.id.pc_export);
    mHeader = findViewById(R.id.header);
    mOptions = findViewById(R.id.options);
    mPosition.setOnClickListener(this);
    mRename.setOnClickListener(this);
    mShare.setOnClickListener(this);
    mAnalyzeDeferred.setOnClickListener(this);
    mPcExport.setOnClickListener(this);
    findViewById(R.id.delete).setOnClickListener(this);

    mAdd = findViewById(R.id.add_button);
    mCancel = findViewById(R.id.service_cancel);
    mCheckbox = findViewById(R.id.checkbox);
    mList = findViewById(R.id.list);
    mText = findViewById(R.id.info_text);
    mWorkflowState = findViewById(R.id.workflow_state);
    mProgress = findViewById(R.id.progressBar);
    mAdd.setOnClickListener(this);
    mCancel.setOnClickListener(this);

    int columns = 3;
    SharedPreferences pref = PreferenceManager.getDefaultSharedPreferences(this);
    columns = pref.getInt(getString(R.string.pref_layout), columns);

    mAdapter = new FileAdapter(this, columns);
    mList.setOnTouchListener((view, event) -> {
      mAdapter.forwardTouch(event);
      return false;
    });
  }

  @Override
  public void onBackPressed()
  {
    if (mProgress.getVisibility() == View.VISIBLE) {
      System.exit(0);
    } else if (mAdapter.hasParent()) {
      mAdapter.toParent();
    } else if (mAdapter.getSelected() != null) {
      mAdapter.update();
    } else {
      moveTaskToBack(true);
    }
  }

  @Override
  public int getNavigationBarColor() {
        return Color.BLACK;
    }

  @Override
  public int getStatusBarColor() {
    return Color.argb(255, 48, 48, 48);
  }

  @Override
  protected void onResume()
  {
    super.onResume();
    mWorkflowState.setVisibility(View.GONE);
    mAdd.setVisibility(View.VISIBLE);
    mCancel.setVisibility(View.GONE);
    mProgress.setVisibility(View.GONE);
    mCancel.setText(android.R.string.cancel);
    mCancel.setOnClickListener(this);
    mAdd.setText(R.string.capture);
    mAdd.setOnClickListener(this);

    int service = Service.getRunning(this);
    if (service > Service.SERVICE_NOT_RUNNING) {
      showWorkflowScreen();
      mCancel.setVisibility(View.VISIBLE);
      mCancel.setText(R.string.scan_processing_cancel_action);
      new Thread(() -> {
        while(Service.getRunning(FileManager.this) > Service.SERVICE_NOT_RUNNING) {
          try
          {
            Thread.sleep(1000);
          } catch (Exception e)
          {
            e.printStackTrace();
          }
          FileManager.this.runOnUiThread(() -> {
            renderActiveWorkflow();
          });
        }
      }).start();
    } else if (Service.getRunning(this) < Service.SERVICE_NOT_RUNNING)
    {
      service = Math.abs(Service.getRunning(this));
      if (Service.backgroundHasError(this)) {
        showErrorState();
        return;
      }
      if (service == Service.SERVICE_SKETCHFAB) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(Service.getLink(this)));
        startActivity(intent);
        Service.forceState(this, null, Service.SERVICE_NOT_RUNNING);
      } else {
        showReadyState(service);
      }
    } else
      setupPermissions();
  }

  private void openProcessingResult(int service) {
    String link = Service.getLink(this);
    Service.reset(this);
    if ((link == null) || link.isEmpty()) {
      refreshUI();
      return;
    }

    File result = new File(link);
    if (!result.exists()) {
      refreshUI();
      return;
    }

    if (link.endsWith(Exporter.EXT_DATASET)) {
      String msg = getString(R.string.data_saved) + " " + result.getName();
      if (ScanSessionMetadata.isRawPending(result)) {
        msg = msg + "\n" + getString(R.string.deferred_save_done_message);
      }
      Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
      refreshUI();
      return;
    }

    mCancel.setVisibility(View.GONE);
    showProgress();
    Intent intent = new Intent(this, Main.class);
    intent.putExtra(FILE_KEY, link);
    startActivity(intent);
  }

  private void openProcessingResult(String link) {
    if ((link == null) || link.isEmpty()) {
      refreshUI();
      return;
    }
    File result = new File(link);
    if (!result.exists()) {
      refreshUI();
      return;
    }
    if (link.endsWith(Exporter.EXT_DATASET)) {
      String msg = getString(R.string.data_saved) + " " + result.getName();
      if (ScanSessionMetadata.isRawPending(result)) {
        msg = msg + "\n" + getString(R.string.deferred_save_done_message);
      }
      Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
      refreshUI();
      return;
    }
    Intent intent = new Intent(this, Main.class);
    intent.putExtra(FILE_KEY, link);
    startActivity(intent);
  }

  public void refreshUI()
  {
    String link = "https://lvonasek.github.io/policy-3dls.html";
    String info = getString(R.string.info).replaceAll("\n", "<br>");
    info = info.replaceAll("#BEGIN#", "<a href=" + link + ">").replaceAll("#END#", "</a>");
    info = info.replaceAll("\"Models\"", "\"Documents\\\\SiteReady Scan\"");

    AlertDialog d;
    String policyKey = "KEY_POLICY_ACCEPTED";
    SharedPreferences pref = PreferenceManager.getDefaultSharedPreferences(this);
    if (!pref.getBoolean(policyKey, false) && !Compatibility.isPlayStoreSupported(this)) {
      mAdd.setVisibility(View.GONE);
      mCancel.setVisibility(View.VISIBLE);
      mCheckbox.setVisibility(View.VISIBLE);
      mCheckbox.setOnCheckedChangeListener((buttonView, isChecked) -> mCancel.setBackgroundResource(isChecked ? R.drawable.background_button : R.drawable.background_button_selected));
      mList.setVisibility(View.GONE);
      mCancel.setBackgroundResource(R.drawable.background_button_selected);
      mCancel.setText(android.R.string.ok);
      mCancel.setOnClickListener(view -> {
        if (mCheckbox.isChecked()) {
          SharedPreferences.Editor e = pref.edit();
          e.putBoolean(policyKey, true);
          e.apply();
          refreshUI();
        }
      });
      mText.setText(Html.fromHtml(info, Html.FROM_HTML_MODE_LEGACY));
      mText.setOnClickListener(v -> openURL(FileManager.this, link));
      return;
    } else if (Initializator.isFirst() && Compatibility.isPlayStoreSupported(this)) {
      LayoutInflater inflater = (LayoutInflater)getSystemService(Context.LAYOUT_INFLATER_SERVICE);
      View view = inflater.inflate(R.layout.dialog_start, null);

      TextView text = view.findViewById(R.id.info);
      text.setText(Html.fromHtml(info, Html.FROM_HTML_MODE_LEGACY));
      text.setOnClickListener(v -> openURL(FileManager.this, link));

      AlertDialog.Builder dialog = new AlertDialog.Builder(this);
      dialog.setView(view);

      d = dialog.create();
      d.getWindow().setBackgroundDrawable(getDrawable(R.drawable.background_dialog));
      d.show();

      if (!Compatibility.isGoogleDepthSupported(this) && !Compatibility.hasToFSensor(this)) {
        d.findViewById(R.id.lowend_device).setVisibility(View.VISIBLE);
      }
    }

    long time = System.currentTimeMillis();
    boolean migrate = hasFilesToMigrate(this);
    if (migrate) {
      Log.d(TAG, "Some files has to be migrated");
    }
    mCancel.setVisibility(View.GONE);
    mCheckbox.setVisibility(View.GONE);
    mList.setVisibility(View.VISIBLE);
    mText.setOnClickListener(null);
    mText.setText(migrate ? R.string.migrating_data : R.string.wait);
    mText.setVisibility(mAdapter.isEmpty() ? View.VISIBLE : View.GONE);
    new Thread(() -> {

      //update file structure
      Exporter.makeStructure(getPath(migrate));

      //get list of files
      runOnUiThread(() -> {
        mAdapter.update();
        Log.d(TAG, "Listing files took " + (System.currentTimeMillis() - time) + "ms");

        mText.setText(R.string.no_data);
        mText.setVisibility(mAdapter.getCount() == 0 ? View.VISIBLE : View.GONE);
        mList.setAdapter(mAdapter);
        mAdd.setVisibility(View.VISIBLE);
        mProgress.setVisibility(View.GONE);

        mAdapter.notifyDataSetChanged();
        if (mAdapter.getCount() > 0) {
          mList.setSelection(0);
        }
      });
    }).start();
  }

  protected void setupPermissions() {
    String[] permissions = {
            Manifest.permission.CAMERA,
            Manifest.permission.INTERNET
    };
    if (android.os.Build.VERSION.SDK_INT >= 33) {
      permissions = new String[] {
              Manifest.permission.CAMERA,
              Manifest.permission.INTERNET,
              Manifest.permission.POST_NOTIFICATIONS
      };
    }

    boolean ok = true;
    for (String s : permissions)
      if (checkSelfPermission(s) != PackageManager.PERMISSION_GRANTED)
        ok = false;

    if (!allowedToAskForPermissions && !ok) {
      mAdd.setVisibility(View.GONE);
      mCancel.setVisibility(View.VISIBLE);
      mList.setVisibility(View.GONE);
      mCancel.setText(android.R.string.ok);
      mCancel.setOnClickListener(view -> {
        allowedToAskForPermissions = true;
        setupPermissions();
      });
      mText.setText(R.string.permissions_required);
      return;
    } else {
      mAdd.setVisibility(View.VISIBLE);
      mList.setVisibility(View.VISIBLE);
      mCancel.setText(android.R.string.cancel);
      mCancel.setOnClickListener(this);
      mCancel.setVisibility(View.GONE);
      allowedToAskForPermissions = false;
    }

    try {
      boolean arcore = Compatibility.isPlayStoreSupported(this);
      boolean arengine = Compatibility.shouldUseHuawei(this);
      if ((!arengine || arcore) && Compatibility.isARSupported(this))
        if (ArCoreApk.getInstance().requestInstall(this, true) != ArCoreApk.InstallStatus.INSTALLED)
          return;
    } catch (Exception e) {
      e.printStackTrace();
    }

    long timestamp = System.currentTimeMillis();
    onPermissionFail = () -> {
      if (System.currentTimeMillis() - timestamp < 100) {
        Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        Uri uri = Uri.fromParts("package", getPackageName(), null);
        intent.setData(uri);
        startActivity(intent);
      }
    };
    onPermissionSuccess = () -> {
      if (Initializator.hasFileIntent()) {
        showProgress();

        new Thread(() -> {

          int index = 0;
          File path;
          do {
            index++;
            path = new File(getPath(false), "Import_" + index + ".obj");
          } while (path.exists());
          path.mkdirs();

          boolean success = IO.unzip(path.getAbsolutePath() + "/", Initializator.getFile(FileManager.this));
          File finalPath = path;
          runOnUiThread(() -> {
            if (success) {
              Intent intent = new Intent(FileManager.this, Main.class);
              intent.putExtra(AbstractActivity.FILE_KEY, finalPath.getAbsolutePath());
              startActivity(intent);
            } else {
              refreshUI();
            }
          });
        }).start();
      } else {
        refreshUI();
      }
    };
    askForPermissions(permissions);
  }

  public void showProgress()
  {
    try {
      mAdd.setVisibility(View.GONE);
      mProgress.setVisibility(View.VISIBLE);
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  @Override
  public void onClick(View v) {
    int id = v.getId();

    if (id == R.id.delete) {
      mAdapter.deleteModel();
    } else if (id == R.id.position) {
      mAdapter.showPosition();
    } else if (id == R.id.rename) {
      mAdapter.rename();
    } else if (id == R.id.share) {
      mAdapter.shareModel();
    } else if (id == R.id.analyze_deferred) {
      String key = mAdapter.getSingleSelectedKey();
      if (key == null) {
        return;
      }
      File ds = new File(AbstractActivity.getPath(false), key);
      if (ScanProcessingService.isRunning(this)) {
        Toast.makeText(this, R.string.scan_processing_busy, Toast.LENGTH_LONG).show();
        return;
      }
      if (!ScanSessionMetadata.isRawPending(ds)) {
        Toast.makeText(this, R.string.deferred_analyze_invalid_dataset, Toast.LENGTH_LONG).show();
        return;
      }
      showProgress();
      if (!ScanProcessingService.startAnalyzeSavedDataset(this, ds.getAbsolutePath())) {
        refreshUI();
        Toast.makeText(this, R.string.deferred_analyze_invalid_dataset, Toast.LENGTH_LONG).show();
        return;
      }
      mAdapter.clearSelection();
    } else if (id == R.id.pc_export) {
      mAdapter.exportPcDataset();
    } else if (id == R.id.add_button) {
      SharedPreferences pref = PreferenceManager.getDefaultSharedPreferences(this);
      if (pref.getBoolean(getString(R.string.pref_gps), false)) {
        String[] permissions = {
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION
        };
        onPermissionSuccess = this::startScanning;
        askForPermissions(permissions);
      } else {
        startScanning();
      }
    } else if (id == R.id.service_cancel) {
      int service = Service.getRunning(this);
      if ((service == Service.SERVICE_POSTPROCESS) || (service == Service.SERVICE_SAVE)) {
        ScanProcessingService.requestCancel(this);
        mText.setVisibility(View.VISIBLE);
        mText.setText(getString(R.string.scan_processing_cancelling));
        mWorkflowState.setVisibility(View.VISIBLE);
        mWorkflowState.setText(getString(R.string.scan_processing_error_notification));
      } else {
        Service.reset(this);
      }
    } else if (id == R.id.settings) {
      startActivity(new Intent(this, Settings.class));
    }
  }


  private void startScanning()
  {
    AlertDialog.Builder builder = new AlertDialog.Builder(this);
    builder.setView(R.layout.dialog_scan);
    Dialog dialog = builder.create();
    dialog.getWindow().setBackgroundDrawable(getDrawable(R.drawable.background_dialog));
    dialog.show();

    ArrayList<Drawable> icons = new ArrayList<>();
    ArrayList<String> values = new ArrayList<>();
    if (Compatibility.isARSupported(this)) {
      icons.add(getDrawable(R.drawable.ic_type_face));
      values.add(getString(R.string.mode_face));
      icons.add(getDrawable(R.drawable.ic_type_scan));
      values.add(getString(R.string.mode_realtime));
      if (isProVersion(this)) {
        icons.add(getDrawable(R.drawable.ic_type_dataset));
        values.add(getString(R.string.mode_dataset));
      }
    }

    SharedPreferences pref = PreferenceManager.getDefaultSharedPreferences(FileManager.this);
    ArrayAdapterWithIcons adapter = new ArrayAdapterWithIcons(this, values, icons);
    GridView list = dialog.findViewById(R.id.list);
    list.setAdapter(adapter);
    list.setOnTouchListener((v, event) -> event.getAction() == MotionEvent.ACTION_MOVE);
    list.setOnItemClickListener((adapterView, view, index, l) -> {
      dialog.dismiss();
      showProgress();

      String mode = values.get(index);
      SharedPreferences.Editor e = pref.edit();
      if (mode.compareTo(getString(R.string.mode_dataset)) == 0) {
        e.putBoolean(getString(R.string.pref_later), true);
        e.putString(getString(R.string.pref_mode), "realtime");
      } else if (mode.compareTo(getString(R.string.mode_face)) == 0) {
        e.putBoolean(getString(R.string.pref_later), false);
        e.putString(getString(R.string.pref_mode), "face");
      } else if (mode.compareTo(getString(R.string.mode_realtime)) == 0) {
        e.putBoolean(getString(R.string.pref_later), false);
        e.putString(getString(R.string.pref_mode), "realtime");
      }
      e.commit();

      startActivity(new Intent(FileManager.this, Main.class));
    });
  }

  public void setColumns(int count) {
    mList.setNumColumns(count);

    SharedPreferences.Editor e = PreferenceManager.getDefaultSharedPreferences(this).edit();
    e.putInt(getString(R.string.pref_layout), count);
    e.commit();
  }

  public void setOptions(int size) {
    boolean on = size > 0;
    mHeader.setVisibility(on ? View.INVISIBLE : View.VISIBLE);
    mOptions.setVisibility(on ? View.VISIBLE : View.GONE);

    if (on) {
      mName.setText(mAdapter.getSelected());
    }

    boolean more = size > 1;
    boolean ext = mAdapter.hasExtension();
    boolean pendingRaw = mAdapter.isPendingRawDatasetSingle();
    mPosition.setVisibility(!more && mAdapter.hasPosition() ? View.VISIBLE : View.GONE);
    mRename.setVisibility(!more ? View.VISIBLE : View.GONE);
    mShare.setVisibility(ext && !more && !pendingRaw ? View.VISIBLE : View.GONE);
    mAnalyzeDeferred.setVisibility(!more && pendingRaw ? View.VISIBLE : View.GONE);
    mPcExport.setVisibility(!more && mAdapter.hasPcDataset() ? View.VISIBLE : View.GONE);

    int background = Color.argb(128, 0, 153, 204);
    setWindow(on ? background : getStatusBarColor(), getNavigationBarColor());
  }

  private void renderActiveWorkflow() {
    String label = Service.backgroundGetWorkflowLabel(this);
    String detail = Service.backgroundGetDetail(this);
    mWorkflowState.setVisibility(View.VISIBLE);
    mWorkflowState.setText((label == null) || label.isEmpty() ? getString(R.string.scan_processing_stage_prepare) : label);
    if ((detail == null) || detail.isEmpty() || detail.equals(label)) {
      mText.setText(getString(R.string.working));
    } else {
      mText.setText(detail);
    }
  }

  private void showErrorState() {
    showWorkflowScreen();
    mWorkflowState.setVisibility(View.VISIBLE);
    mWorkflowState.setText(getString(R.string.scan_processing_error_notification));
    mText.setText(Service.backgroundGetError(this));
    String retryDataset = Service.backgroundGetRetryDataset(this);
    if ((retryDataset != null) && !retryDataset.isEmpty()) {
      mCancel.setVisibility(View.VISIBLE);
      mCancel.setText(R.string.retry_processing);
      mCancel.setOnClickListener(v -> retryProcessing());
      mAdd.setVisibility(View.VISIBLE);
      mAdd.setText(R.string.new_scan);
      mAdd.setOnClickListener(v -> {
        Service.reset(FileManager.this);
        startScanning();
      });
    } else {
      mCancel.setVisibility(View.VISIBLE);
      mCancel.setText(android.R.string.ok);
      mCancel.setOnClickListener(v -> {
        Service.reset(FileManager.this);
        refreshUI();
      });
      mAdd.setVisibility(View.VISIBLE);
      mAdd.setText(R.string.new_scan);
      mAdd.setOnClickListener(v -> {
        Service.reset(FileManager.this);
        startScanning();
      });
    }
  }

  private void showReadyState(int service) {
    String link = Service.getLink(this);
    ScanWorkflowState workflowState = Service.backgroundGetWorkflowState(this);
    boolean pcDatasetReady = (workflowState == ScanWorkflowState.READY_PC_DATASET)
            && (link != null) && link.toLowerCase(Locale.US).endsWith(".zip");

    showWorkflowScreen();
    mWorkflowState.setVisibility(View.VISIBLE);
    if (pcDatasetReady) {
      mWorkflowState.setText(getString(R.string.scan_processing_stage_ready_pc_dataset));
      mText.setText(link + "\n\n" + getString(R.string.pc_export_share_hint));
      mCancel.setVisibility(View.VISIBLE);
      mCancel.setText(R.string.share_pc_zip);
      mCancel.setOnClickListener(v -> sharePcZip(link));
    } else {
      mWorkflowState.setText(getString(R.string.scan_processing_stage_ready));
      if ((link == null) || link.isEmpty()) {
        mText.setText(getString(R.string.scan_processing_ready_notification));
      } else {
        mText.setText(new File(link).getName());
      }
      if ((service == Service.SERVICE_SAVE || service == Service.SERVICE_POSTPROCESS)
              && (link != null) && !link.endsWith(Exporter.EXT_DATASET)) {
        mCancel.setVisibility(View.VISIBLE);
        mCancel.setText(R.string.view_model);
        mCancel.setOnClickListener(v -> {
          String resultLink = Service.getLink(FileManager.this);
          Service.reset(FileManager.this);
          openProcessingResult(resultLink);
        });
      }
    }
    mAdd.setVisibility(View.VISIBLE);
    mAdd.setText(R.string.new_scan);
    mAdd.setOnClickListener(v -> {
      Service.reset(FileManager.this);
      startScanning();
    });
  }

  private void sharePcZip(String zipPath) {
    File zipFile = new File(zipPath);
    if (!zipFile.exists()) {
      Toast.makeText(this, R.string.export_pc_dataset_failed, Toast.LENGTH_LONG).show();
      return;
    }
    Intent intent = new Intent(Intent.ACTION_SEND);
    intent.setType("application/zip");
    Uri uri = FileProvider.getUriForFile(this, BuildConfig.APPLICATION_ID + ".provider", zipFile);
    intent.putExtra(Intent.EXTRA_STREAM, uri);
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivity(Intent.createChooser(intent, getString(R.string.share_pc_zip)));
  }

  private void showWorkflowScreen() {
    mAdd.setVisibility(View.GONE);
    mList.setVisibility(View.GONE);
    mText.setVisibility(View.VISIBLE);
    mText.setText("");
    mWorkflowState.setVisibility(View.VISIBLE);
    mProgress.setVisibility(View.GONE);
  }

  private void retryProcessing() {
    String dataset = Service.backgroundGetRetryDataset(this);
    String exportMode = Service.backgroundGetRetryExportMode(this);
    boolean poisson = Service.backgroundGetRetryPoisson(this);
    boolean analyse = Service.backgroundGetRetryAnalyse(this);
    Service.reset(this);
    if (!ScanProcessingService.startPostprocess(this, dataset, exportMode, poisson, analyse)) {
      refreshUI();
      return;
    }
    showWorkflowScreen();
    mCancel.setVisibility(View.VISIBLE);
    mCancel.setText(R.string.scan_processing_cancel_action);
    mCancel.setOnClickListener(this);
    renderActiveWorkflow();
  }
}
